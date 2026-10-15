import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const ok = (data: unknown, meta = {}) => reply(200, { success: true, message: "OK", data, meta });
const fail = (status: number, code: string, message: string, errors?: unknown[]) => reply(status, { success: false, code, message, errors });
const session = (token: string) => ({ user: { id: "1", name: "A", email: "a@b.co", role: "SUPER_ADMIN" }, accessToken: token });

const fetchMock = vi.fn<typeof fetch>();

// http.ts keeps the access token in a module variable, so each test gets a fresh copy.
const load = async () => import("./http");

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const calledPaths = () => fetchMock.mock.calls.map(([url]) => String(url));

describe("http", () => {
  it("returns the response body and sends the access token", async () => {
    const { http, setAccessToken } = await load();
    setAccessToken("abc");
    fetchMock.mockResolvedValueOnce(ok([1, 2], { page: 1 }));

    const body = await http<number[]>("/things");
    expect(body.data).toEqual([1, 2]);
    expect(body.meta).toEqual({ page: 1 });
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({ Authorization: "Bearer abc" });
  });

  it("turns an error response into an ApiError with its code and field errors", async () => {
    const { http, ApiError } = await load();
    fetchMock.mockResolvedValueOnce(fail(400, "VALIDATION_ERROR", "Invalid request", [{ field: "email", message: "Bad" }]));

    const err = await http("/things").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: "VALIDATION_ERROR", errors: [{ field: "email", message: "Bad" }] });
  });

  it("copes with a response that is not JSON", async () => {
    const { http } = await load();
    fetchMock.mockResolvedValueOnce(new Response("<html>bad gateway</html>", { status: 502 }));
    await expect(http("/things")).rejects.toMatchObject({ status: 502, code: "UNKNOWN", message: "Request failed" });
  });

  it("renews an expired access token once and repeats the request", async () => {
    const { http, getAccessToken } = await load();
    fetchMock
      .mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "Authentication required"))
      .mockResolvedValueOnce(ok(session("fresh")))
      .mockResolvedValueOnce(ok("the data"));

    expect((await http("/things")).data).toBe("the data");
    expect(calledPaths()).toEqual(["/api/v1/things", "/api/v1/auth/refresh", "/api/v1/things"]);
    expect(getAccessToken()).toBe("fresh");
  });

  it("shares one refresh between requests that fail together", async () => {
    const { http } = await load();
    const refused = new Set<string>(); // each path is refused once, then works
    fetchMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path.endsWith("/auth/refresh")) return ok(session("fresh"));
      if (refused.has(path)) return ok(path);
      refused.add(path);
      return fail(401, "UNAUTHORIZED", "x");
    });

    await Promise.all([http("/a"), http("/b")]);
    expect(calledPaths().filter((path) => path.endsWith("/auth/refresh"))).toHaveLength(1);
  });

  it("ends the session when the refresh token is rejected", async () => {
    const { http, setSessionExpiredHandler } = await load();
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock.mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "x")).mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "x"));

    await expect(http("/things")).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
  });

  it("ends the session when the repeated request is still refused", async () => {
    const { http, setSessionExpiredHandler } = await load();
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock
      .mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "x"))
      .mockResolvedValueOnce(ok(session("fresh")))
      .mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "x"));

    await expect(http("/things")).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
  });

  it("does not sign anyone out because of a network failure while refreshing", async () => {
    const { http, setSessionExpiredHandler } = await load();
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    fetchMock.mockResolvedValueOnce(fail(401, "UNAUTHORIZED", "x")).mockRejectedValueOnce(new TypeError("Failed to fetch"));

    await expect(http("/things")).rejects.toThrow("Failed to fetch");
    expect(expired).not.toHaveBeenCalled();
  });

  it("does not try to refresh when the auth routes themselves answer 401", async () => {
    const { http } = await load();
    fetchMock.mockResolvedValueOnce(fail(401, "INVALID_CREDENTIALS", "Invalid email or password"));
    await expect(http("/auth/login", { method: "POST" })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("takes its turn with other tabs when the browser supports locks", async () => {
    const { refreshSession } = await load();
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal("navigator", { locks: { request } });
    fetchMock.mockResolvedValueOnce(ok(session("fresh")));

    await refreshSession();
    expect(request).toHaveBeenCalledWith("emr-refresh", expect.any(Function));
  });
});
