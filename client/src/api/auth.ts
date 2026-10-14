import { http, setAccessToken, type Session } from "./http";

export async function login(email: string, password: string) {
  const { data } = await http<Session>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function logout() {
  try {
    await http("/auth/logout", { method: "POST" });
  } finally {
    setAccessToken(null);
  }
}
