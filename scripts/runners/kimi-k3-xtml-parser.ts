// TypeScript port of vLLM's KimiK3ToolParser.extract_tool_calls (non-streaming path
// only). Reference: vllm/tool_parsers/kimi_k3_tool_parser.py in the vLLM project.
// Deliberately does NOT port the streaming variant or adjust_request — those are
// vLLM server-side concerns; offload-implementer only ever reads a completed
// dispatch's captured text.

export interface DecodedToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface XtmlExtractionResult {
  toolCalls: DecodedToolCall[];
  content: string | null;
}

const O = String.raw`<\|open\|>`;
const C = String.raw`<\|close\|>`;
const S = String.raw`<\|sep\|>`;
const TEXT_UNTIL_SEP = `(?:(?!${S}).)*?`;

const TOOLS_OPEN_RE = new RegExp(`${O}\\s*tools\\s*${S}`);
const TOOLS_CLOSE_RE = new RegExp(`${C}\\s*tools\\s*${S}`);
const RESPONSE_OPEN_RE = new RegExp(`${O}\\s*response\\s*${S}`);
const RESPONSE_CLOSE_RE = new RegExp(`${C}\\s*response\\s*${S}`, "g");
const MESSAGE_CLOSE_RE = new RegExp(`${C}\\s*message\\s*${S}`, "g");
const RESPONSE_RE = new RegExp(`${O}\\s*response\\s*${S}(?<c>.*?)${C}\\s*response\\s*${S}`, "s");
const CALL_RE = new RegExp(
  `${O}\\s*call\\s+(?<attrs>${TEXT_UNTIL_SEP})${S}(?<body>.*?)${C}\\s*call\\s*${S}`,
  "gs",
);
const ARG_RE = new RegExp(
  `${O}\\s*argument\\s+(?<attrs>${TEXT_UNTIL_SEP})${S}(?<val>.*?)${C}\\s*argument\\s*${S}`,
  "gs",
);
const ATTR_RE = /(?<k>\w+)="(?<v>[^"]*)"/g;

/** Detects the leaked-XTML tool-call channel marker, without decoding anything. */
export function hasXtmlToolCallChannel(text: string): boolean {
  return TOOLS_OPEN_RE.test(text);
}

function decodeAttrs(s: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const m of s.matchAll(ATTR_RE)) {
    const k = m.groups!.k;
    const v = m.groups!.v.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
    result[k] = v;
  }
  return result;
}

function decodeCall(attrsText: string, body: string): DecodedToolCall | null {
  const callAttrs = decodeAttrs(attrsText);
  const toolName = callAttrs.tool ?? "";
  const args: Record<string, unknown> = {};
  for (const m of body.matchAll(ARG_RE)) {
    const argAttrs = decodeAttrs(m.groups!.attrs);
    const key = argAttrs.key ?? "";
    const argType = argAttrs.type ?? "string";
    const rawValue = m.groups!.val;
    if (argType === "string") {
      args[key] = rawValue.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
    } else {
      try {
        args[key] = JSON.parse(rawValue);
      } catch {
        args[key] = rawValue;
      }
    }
  }
  if (!toolName) return null;
  return { name: toolName, arguments: args };
}

function stripResponseContent(text: string): string | null {
  const mOpen = RESPONSE_OPEN_RE.exec(text);
  let result: string;
  if (mOpen) {
    const start = mOpen.index + mOpen[0].length;
    const mClose = RESPONSE_CLOSE_RE.exec(text.slice(start));
    result = mClose ? text.slice(start, start + mClose.index) : text.slice(start);
  } else {
    result = text.replace(RESPONSE_CLOSE_RE, "");
  }
  result = result.replace(MESSAGE_CLOSE_RE, "");
  return result || null;
}

function extractContent(fullText: string, before: string): string | null {
  const m = RESPONSE_RE.exec(fullText);
  if (m) return m.groups!.c || null;
  return stripResponseContent(before);
}

/** Extracts decoded tool calls and unwrapped content from a raw XTML response. */
export function extractXtmlToolCalls(text: string): XtmlExtractionResult {
  const mOpen = TOOLS_OPEN_RE.exec(text);
  if (!mOpen) {
    return { toolCalls: [], content: extractContent(text, text) };
  }
  const before = text.slice(0, mOpen.index);
  const start = mOpen.index + mOpen[0].length;
  const mClose = TOOLS_CLOSE_RE.exec(text.slice(start));
  const section = mClose ? text.slice(start, start + mClose.index) : text.slice(start);

  const toolCalls: DecodedToolCall[] = [];
  for (const m of section.matchAll(CALL_RE)) {
    const decoded = decodeCall(m.groups!.attrs, m.groups!.body);
    if (decoded) toolCalls.push(decoded);
  }
  return { toolCalls, content: extractContent(text, before) };
}
