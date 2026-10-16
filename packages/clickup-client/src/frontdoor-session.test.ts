import { describe, it, expect, vi } from "vitest";
import {
  renewSession,
  isDue,
  tokenExpiry,
  mergeCookies,
  RenewalError,
  RENEW_URL_PATH,
  type RenewResponse,
  type FrontdoorSession,
} from "./frontdoor-session.ts";

import { fakeJwt, memoryStore } from "./frontdoor-session.test-util.ts";

const NOW = 1_800_000_000;
const COOKIE = "cu_refresh=fake-refresh-cookie; cu_session_meta=fake-meta-cookie";

function ok(token: string, setCookies: string[] = []): RenewResponse {
  return { status: 200, body: { token, expiration: NOW + 172800 }, setCookies };
}

describe("tokenExpiry / isDue", () => {
  it("reads exp from a Bearer JWT and from a bare JWT", () => {
    expect(tokenExpiry(`Bearer ${fakeJwt(123)}`)).toBe(123);
    expect(tokenExpiry(fakeJwt(456))).toBe(456);
    expect(tokenExpiry("Bearer not-a-jwt")).toBeUndefined();
  });
  it("is due when under 10 minutes remain, and when already expired", () => {
    expect(isDue(`Bearer ${fakeJwt(NOW + 599)}`, NOW)).toBe(true);
    expect(isDue(`Bearer ${fakeJwt(NOW - 5000)}`, NOW)).toBe(true);
    expect(isDue(`Bearer ${fakeJwt(NOW + 601)}`, NOW)).toBe(false);
  });
  it("is not due when the token has no readable exp", () => {
    expect(isDue("Bearer opaque", NOW)).toBe(false);
  });
});

describe("mergeCookies", () => {
  it("replaces only cu_refresh and cu_session_meta from non-empty Set-Cookie values", () => {
    const merged = mergeCookies(COOKIE, [
      "cu_refresh=fake-rotated; Domain=app.clickup.com; Path=/; HttpOnly",
      "cu_jwt=ignored; Path=/",
      "cu_session_meta=; Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    ]);
    expect(merged).toBe("cu_refresh=fake-rotated; cu_session_meta=fake-meta-cookie");
  });
  it("keeps the cookie as it was when nothing rotates", () => {
    expect(mergeCookies(COOKIE, ["cu_jwt=a; Path=/"])).toBe(COOKIE);
  });
});

describe("renewSession", () => {
  it("POSTs the access_tokens endpoint with the stored cookie and the web app's Origin and Referer", async () => {
    const store = memoryStore({ auth: `Bearer ${fakeJwt(NOW + 10)}`, refreshCookie: COOKIE });
    const transport = vi.fn().mockResolvedValue(ok(fakeJwt(NOW + 172800, "new")));
    await renewSession({ store, teamId: "5738747", transport, now: () => NOW * 1000 });
    expect(transport).toHaveBeenCalledTimes(1);
    const req = transport.mock.calls[0][0];
    expect(req.url).toBe(`https://id.app.clickup.com${RENEW_URL_PATH("5738747")}`);
    expect(req.url).toBe("https://id.app.clickup.com/data/v3/workspaces/5738747/authentication/access_tokens");
    expect(req.headers).toEqual({
      Cookie: COOKIE,
      Origin: "https://app.clickup.com",
      Referer: "https://app.clickup.com/",
    });
  });

  it("stores the new token as a Bearer header and returns old and new expiry", async () => {
    const store = memoryStore({ auth: `Bearer ${fakeJwt(NOW + 10)}`, refreshCookie: COOKIE });
    const fresh = fakeJwt(NOW + 172800, "new");
    const r = await renewSession({ store, teamId: "1", transport: async () => ok(fresh), now: () => NOW * 1000 });
    expect(store.current?.auth).toBe(`Bearer ${fresh}`);
    expect(r).toMatchObject({ renewed: true, oldExp: NOW + 10, newExp: NOW + 172800 });
    expect(store.locks).toBe(1);
  });

  it("stores a rotated refresh cookie", async () => {
    const store = memoryStore({ auth: `Bearer ${fakeJwt(NOW)}`, refreshCookie: COOKIE });
    await renewSession({
      store,
      teamId: "1",
      transport: async () => ok(fakeJwt(NOW + 172800), ["cu_refresh=fake-rotated; Path=/"]),
      now: () => NOW * 1000,
    });
    expect(store.current?.refreshCookie).toBe("cu_refresh=fake-rotated; cu_session_meta=fake-meta-cookie");
  });

  it("adopts a token another process stored meanwhile, without a call", async () => {
    const held = `Bearer ${fakeJwt(NOW + 5)}`;
    const store = memoryStore({ auth: `Bearer ${fakeJwt(NOW + 172800, "other")}`, refreshCookie: COOKIE });
    const transport = vi.fn();
    const r = await renewSession({ store, teamId: "1", transport, now: () => NOW * 1000, heldAuth: held });
    expect(transport).not.toHaveBeenCalled();
    expect(r.renewed).toBe(false);
    expect(r.session.auth).toBe(store.current?.auth);
  });

  it("still renews when the stored token equals the held one", async () => {
    const held = `Bearer ${fakeJwt(NOW + 5)}`;
    const store = memoryStore({ auth: held, refreshCookie: COOKIE });
    const transport = vi.fn().mockResolvedValue(ok(fakeJwt(NOW + 172800)));
    await renewSession({ store, teamId: "1", transport, now: () => NOW * 1000, heldAuth: held });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("throws a plain RenewalError with the HTTP code and no secret on a non-200", async () => {
    const store = memoryStore({ auth: `Bearer ${fakeJwt(NOW)}`, refreshCookie: COOKIE });
    const err = await renewSession({
      store,
      teamId: "1",
      transport: async () => ({ status: 401, body: { err: "fake-refresh-cookie leaked?" }, setCookies: [] }),
      now: () => NOW * 1000,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(RenewalError);
    expect(err.message).toBe(
      "renewal failed (HTTP 401): capture a new session with Proxyman, then dg clickup frontdoor import-auth",
    );
    expect(err.status).toBe(401);
    expect(store.current?.auth).toBe(`Bearer ${fakeJwt(NOW)}`);
  });

  it("treats a 200 without a token as a failure", async () => {
    const store = memoryStore({ auth: `Bearer ${fakeJwt(NOW)}`, refreshCookie: COOKIE });
    await expect(
      renewSession({ store, teamId: "1", transport: async () => ({ status: 200, body: {}, setCookies: [] }), now: () => NOW * 1000 }),
    ).rejects.toThrow("renewal failed (HTTP 200)");
  });

  it("turns a transport exception into a RenewalError that carries none of its text", async () => {
    const store = memoryStore({ auth: `Bearer ${fakeJwt(NOW)}`, refreshCookie: COOKIE });
    const err = await renewSession({
      store,
      teamId: "1",
      transport: async () => {
        throw new Error("boom fake-refresh-cookie");
      },
      now: () => NOW * 1000,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(RenewalError);
    expect(err.message).not.toContain("fake-refresh-cookie");
    expect(err.message).toContain("renewal failed (no answer)");
  });

  it("throws when no refresh cookie is stored", async () => {
    const store = memoryStore({ auth: `Bearer ${fakeJwt(NOW)}` });
    const transport = vi.fn();
    await expect(renewSession({ store, teamId: "1", transport, now: () => NOW * 1000 })).rejects.toThrow(/no refresh cookie/);
    expect(transport).not.toHaveBeenCalled();
  });
});

describe("mergeCookies order", () => {
  it("always writes cu_refresh first, then cu_session_meta", () => {
    expect(mergeCookies("", ["cu_session_meta=m", "cu_refresh=r"])).toBe("cu_refresh=r; cu_session_meta=m");
  });
});

describe("axiosRenewTransport", () => {
  it("POSTs without a body, never throws on a 4xx, and returns status, body and Set-Cookie lines only", async () => {
    const { default: axios } = await import("axios");
    const post = vi.spyOn(axios, "post").mockResolvedValue({
      status: 401,
      data: { err: "x" },
      headers: { "set-cookie": ["a=1", "b=2"], authorization: "fake-header-secret" },
      config: { headers: { Cookie: "fake-refresh-cookie" } },
    });
    const { axiosRenewTransport } = await import("./frontdoor-session.ts");
    const res = await axiosRenewTransport({ url: "https://x/y", headers: { Cookie: "c" } });
    expect(post.mock.calls[0][1]).toBeUndefined();
    expect(post.mock.calls[0][2]).toMatchObject({ headers: { Cookie: "c" }, timeout: 15000 });
    expect(post.mock.calls[0][2]!.validateStatus!(401)).toBe(true);
    expect(res).toEqual({ status: 401, body: { err: "x" }, setCookies: ["a=1", "b=2"] });
    post.mockRejectedValue(Object.assign(new Error("boom Cookie: fake-refresh-cookie"), { code: "ECONNRESET", config: {} }));
    const err = await axiosRenewTransport({ url: "https://x/y", headers: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(RenewalError);
    expect(err.message).toContain("ECONNRESET");
    expect(JSON.stringify(err) + String(err.stack)).not.toContain("fake-refresh-cookie");
    post.mockRestore();
  });
});
