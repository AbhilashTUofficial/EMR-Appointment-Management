import { http, setAccessToken, type Session } from "./http";

export async function login(email: string, password: string) {
  const { data } = await http<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setAccessToken(data.accessToken);
  return data.user;
}

// Signing out always succeeds locally, even if the server can't be reached.
export async function logout() {
  setAccessToken(null);
  await http("/auth/logout", { method: "POST" }).catch(() => {});
}
