/**
 * What a failed ClickUp or Frontdoor call throws. It copies plain fields only: an AxiosError carries
 * config.headers and the raw request header block, which hold the Authorization value, so none of
 * config, headers, request, response or cause is kept.
 */
export class ClickUpApiError extends Error {
  readonly method: string;
  readonly path: string;
  readonly status: number | undefined;
  /** ClickUp's error body ({ err, ECODE } or a string), when it sent one. */
  readonly body: unknown;
  /** The network or axios code, such as ECONNREFUSED. */
  readonly code: string | undefined;

  constructor(message: string, fields: { method: string; path: string; status?: number; body?: unknown; code?: string }) {
    super(message);
    this.name = "ClickUpApiError";
    this.method = fields.method;
    this.path = fields.path;
    this.status = fields.status;
    this.body = fields.body;
    this.code = fields.code;
  }
}

interface AxiosLike {
  message?: unknown;
  code?: unknown;
  isAxiosError?: unknown;
  response?: { status?: unknown; data?: unknown };
}

/** axios is mocked whole in tests, so axios.isAxiosError is not usable: check the shape. */
export function isAxiosLike(err: unknown): err is AxiosLike {
  return typeof err === "object" && err !== null && ("isAxiosError" in err || "response" in err);
}

/** Turns an axios-shaped error into a ClickUpApiError; the message is axios's text plus ClickUp's body. */
export function toApiError(err: AxiosLike, method: string, path: string): ClickUpApiError {
  const body = err.response?.data;
  const text = typeof err.message === "string" ? err.message : "request failed";
  const shown = body === undefined || body === "" ? "" : `: ${typeof body === "string" ? body : JSON.stringify(body)}`;
  return new ClickUpApiError(`${text}${shown}`, {
    method,
    path,
    status: typeof err.response?.status === "number" ? err.response.status : undefined,
    body: body === "" ? undefined : body,
    code: typeof err.code === "string" ? err.code : undefined,
  });
}
