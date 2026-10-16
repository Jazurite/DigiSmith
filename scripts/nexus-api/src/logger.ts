// The only code that writes log lines. A line has fixed fields and nothing else (spec section 10).
export type LogSink = (line: string) => void

export interface RequestFields { method: string; path: string; status: number; ms: number; code?: string }
export interface Logger {
  request(f: RequestFields): void
  info(message: 'listening', fields: { host: string; port: number }): void
}

const MAX_PATH = 200
// Only a code from this list can be logged. Anything else becomes "unknown", so no message text can leak through here.
const CODES = new Set(['profile_missing', 'profile_invalid', 'key_unavailable', 'internal_invalid', 'bad_request', 'no_reading', 'not_found', 'method_not_allowed'])

export function createLogger(sink: LogSink = line => process.stdout.write(line + '\n'), now: () => number = Date.now): Logger {
  return {
    request(f) {
      const code = f.code === undefined ? undefined : CODES.has(f.code) ? f.code : 'unknown'
      sink(JSON.stringify({ time: new Date(now()).toISOString(), level: 'info', method: String(f.method).slice(0, 10), path: String(f.path).slice(0, MAX_PATH), status: f.status, ms: Math.round(f.ms), ...(code ? { code } : {}) }))
    },
    info(message, fields) {
      sink(JSON.stringify({ time: new Date(now()).toISOString(), level: 'info', msg: message, host: fields.host, port: fields.port }))
    },
  }
}
