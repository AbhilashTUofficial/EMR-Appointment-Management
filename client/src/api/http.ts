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

// Every API call goes through here so the envelope is unwrapped and errors look the same everywhere.
export async function http<T>(path: string, init: RequestInit = {}): Promise<ApiResponse<T>> {
  const res = await fetch(`/api/v1${path}`, {
    credentials: "include",
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new ApiError(res.status, body?.code ?? "UNKNOWN", body?.message ?? "Request failed", body?.errors);
  }
  return body;
}
