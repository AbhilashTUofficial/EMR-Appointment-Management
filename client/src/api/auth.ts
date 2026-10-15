import { ApiError, http, setAccessToken, type Session } from "./http";

export async function login(email: string, password: string) {
  const { data } = await http<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setAccessToken(data.accessToken);
  return data.user;
}

// Throws when the server could not be asked to end the session, because the sign-in cookie would still be
// valid. A rejection (such as an already-expired session) is fine: that session is over either way.
export async function logout() {
  try {
    await http("/auth/logout", { method: "POST" });
  } catch (err) {
    if (!(err instanceof ApiError) || err.status >= 500) throw err;
  }
  setAccessToken(null);
}
