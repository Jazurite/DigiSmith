import type { FrontdoorSession, SessionStore } from "./frontdoor-session.ts";

export function fakeJwt(exp: number, tag = "x"): string {
  return `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ exp, tag })).toString("base64url")}.fake-signature`;
}

export function memoryStore(initial?: FrontdoorSession): SessionStore & { current?: FrontdoorSession; locks: number } {
  const store = {
    current: initial,
    locks: 0,
    read: () => (store.current ? { ...store.current } : undefined),
    write: (s: FrontdoorSession) => {
      store.current = { ...s };
    },
    withLock: async <T>(fn: () => Promise<T>) => {
      store.locks++;
      return fn();
    },
  };
  return store;
}
