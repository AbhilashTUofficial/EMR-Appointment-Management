import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useRealtime } from "./useRealtime";

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socket = {
    on: (event: string, handler: (...args: unknown[]) => void) => {
      handlers.set(event, handler);
      return socket;
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return { handlers, socket, refreshSession: vi.fn() };
});

vi.mock("socket.io-client", () => ({ io: () => mocks.socket }));
vi.mock("../api/http", () => ({ getAccessToken: () => "token", refreshSession: mocks.refreshSession }));

// The braces matter: act() would wait for a promise if the handler returned one.
const emit = (event: string, ...args: unknown[]) =>
  act(() => {
    mocks.handlers.get(event)?.(...args);
  });

let queryClient: QueryClient;
let invalidated: () => string[];

beforeEach(() => {
  mocks.handlers.clear();
  mocks.socket.connect.mockReset();
  mocks.socket.disconnect.mockReset();
  mocks.refreshSession.mockReset().mockResolvedValue({});
  queryClient = new QueryClient();
  const spy = vi.spyOn(queryClient, "invalidateQueries");
  invalidated = () => spy.mock.calls.map(([filters]) => String(filters?.queryKey?.[0]));
});
afterEach(cleanup);

const mount = () =>
  renderHook(() => useRealtime(), {
    wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>,
  });

describe("useRealtime", () => {
  it("refetches what is on screen when an appointment changes", () => {
    mount();
    emit("appointment:created");
    expect(invalidated()).toEqual(["slots", "appointments", "dashboard"]);
  });

  it("refetches slots and doctors when a schedule changes", () => {
    mount();
    emit("schedule:updated");
    expect(invalidated()).toEqual(["slots", "doctors"]);
  });

  it("does not refetch on the first connection, since the screens just loaded, but does after a reconnect", () => {
    mount();
    emit("connect");
    expect(invalidated()).toEqual([]);

    emit("disconnect", "transport close");
    emit("connect");
    expect(invalidated()).toEqual(["slots", "appointments", "dashboard"]);
  });

  it("reports when the connection is down and when it is back", () => {
    const { result } = mount();
    expect(result.current).toBe(true);

    emit("disconnect", "transport close");
    expect(result.current).toBe(false);
    emit("connect");
    expect(result.current).toBe(true);
  });

  it("gets a new token and reconnects when the server ends the connection (the access token ran out)", async () => {
    mount();
    emit("disconnect", "io server disconnect");
    await vi.waitFor(() => expect(mocks.socket.connect).toHaveBeenCalledOnce());
    expect(mocks.refreshSession).toHaveBeenCalledOnce();
  });

  it("renews the token once if it is refused when connecting, but not in a loop", async () => {
    mount();
    emit("connect_error", new Error("UNAUTHORIZED"));
    await vi.waitFor(() => expect(mocks.socket.connect).toHaveBeenCalledOnce());

    emit("connect_error", new Error("UNAUTHORIZED"));
    await Promise.resolve();
    expect(mocks.refreshSession).toHaveBeenCalledOnce();
  });

  it("ignores other connection errors and its own disconnect", () => {
    const { result } = mount();
    emit("disconnect", "io client disconnect");
    expect(result.current).toBe(true);

    emit("connect_error", new Error("xhr poll error"));
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });

  it("closes the connection when the screen goes away", () => {
    mount().unmount();
    expect(mocks.socket.disconnect).toHaveBeenCalled();
  });
});
