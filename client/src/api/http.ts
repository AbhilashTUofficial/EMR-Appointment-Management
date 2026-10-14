export type ApiResponse<T> = { success: true; message: string; data: T; meta: Record<string, unknown> };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public errors: { field: string; message: string }[] = [],
  ) {
    super(message);
  }
}

export type Role = "SUPER_ADMIN" | "RECEPTIONIST" | "DOCTOR";
export type User = { id: string; name: string; email: string; role: Role };
export type Session = { user: User; accessToken: string };

// The access token lives only in memory; the refresh token is an httpOnly cookie the browser manages.
let accessToken: string | null = null;
let onSessionExpired = () => {};

export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

async function parse<T>(res: Response): Promise<ApiResponse<T>> {
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new ApiError(res.status, body?.code ?? "UNKNOWN", body?.message ?? "Request failed", body?.errors);
  }
  return body;
}

function send(path: string, init: RequestInit) {
  return fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      ...init.headers,
    },
  });
}

// Refresh tokens work once, so concurrent callers must share a single request.
let refreshing: Promise<Session> | null = null;

export function refreshSession(): Promise<Session> {
  refreshing ??= send("/auth/refresh", { method: "POST" })
    .then((res) => parse<Session>(res))
    .then((body) => {
      accessToken = body.data.accessToken;
      return body.data;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

// Every API call goes through here so failures always surface as an ApiError.
export async function http<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  let res = await send(path, init);

  // An expired access token is renewed once and the request retried.
  if (res.status === 401 && !path.startsWith("/auth/")) {
    try {
      await refreshSession();
    } catch {
      onSessionExpired();
      throw new ApiError(401, "UNAUTHORIZED", "Your session has expired. Please sign in again.");
    }
    res = await send(path, init);
  }
  return parse<T>(res);
}
