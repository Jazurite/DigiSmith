// The only code that writes log lines. A line has fixed fields and nothing else (spec section 10).
export type LogSink = (line: string) => void

export interface RequestFields { method: string; path: string; status: number; ms: number; code?: string }
export interface Logger {
  request(f: RequestFields): void
  info(message: 'listening', fields: { host: string; port: number }): void
  error(message: 'scheduler_error', fields: { where: string; code: string }): void
}

const MAX_PATH = 200
// The scheduler places an error line can name; anything else becomes "unknown".
const WHERE = new Set(['append_run', 'write_state', 'read_state', 'read_runs', 'tick', 'start', 'notify', 'stop', 'unhandled_rejection'])
// an error code like ENOTDIR or an error class name like TypeError; never message text
const ERROR_CODE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/
// Only a code from this list can be logged. Anything else becomes "unknown", so no message text can leak through here.
const CODES = new Set(['profile_missing', 'profile_invalid', 'key_unavailable', 'internal_invalid', 'bad_request', 'no_reading', 'not_found', 'method_not_allowed', 'already_running', 'forbidden', 'stopped'])

export function createLogger(sink: LogSink = line => process.stdout.write(line + '\n'), now: () => number = Date.now): Logger {
  return {
    request(f) {
      const code = f.code === undefined ? undefined : CODES.has(f.code) ? f.code : 'unknown'
      sink(JSON.stringify({ time: new Date(now()).toISOString(), level: 'info', method: String(f.method).slice(0, 10), path: String(f.path).slice(0, MAX_PATH), status: f.status, ms: Math.round(f.ms), ...(code ? { code } : {}) }))
    },
    info(message, fields) {
      sink(JSON.stringify({ time: new Date(now()).toISOString(), level: 'info', msg: message, host: fields.host, port: fields.port }))
    },
    error(message, fields) {
      const where = WHERE.has(fields.where) ? fields.where : 'unknown'
      const code = ERROR_CODE.test(fields.code) ? fields.code : 'unknown'
      sink(JSON.stringify({ time: new Date(now()).toISOString(), level: 'error', msg: message, where, code }))
    },
  }
}
