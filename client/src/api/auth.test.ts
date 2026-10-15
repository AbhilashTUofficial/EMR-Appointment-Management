import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn<typeof fetch>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const signedIn = async () => {
  const http = await import("./http");
  http.setAccessToken("token");
  return { ...http, ...(await import("./auth")) };
};

describe("logout", () => {
  it("forgets the access token once the server has ended the session", async () => {
    const { logout, getAccessToken } = await signedIn();
    fetchMock.mockResolvedValueOnce(json(200, { success: true, message: "Logged out", data: null, meta: {} }));
    await logout();
    expect(getAccessToken()).toBeNull();
  });

  it("counts a rejected session as signed out", async () => {
    const { logout, getAccessToken } = await signedIn();
    fetchMock.mockResolvedValueOnce(json(400, { success: false, code: "BAD_REQUEST", message: "x" }));
    await logout();
    expect(getAccessToken()).toBeNull();
  });

  it("fails, and stays signed in, when the server cannot be reached or errors", async () => {
    const { logout, getAccessToken } = await signedIn();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(logout()).rejects.toThrow("Failed to fetch");

    fetchMock.mockResolvedValueOnce(json(500, { success: false, code: "INTERNAL_ERROR", message: "x" }));
    await expect(logout()).rejects.toMatchObject({ status: 500 });
    expect(getAccessToken()).toBe("token");
  });
});
