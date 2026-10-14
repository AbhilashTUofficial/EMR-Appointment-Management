import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as authApi from "../api/auth";
import { refreshSession, setSessionExpiredHandler, type User } from "../api/http";

type AuthState = {
  user: User | null;
  loading: boolean; // true until the first refresh attempt has finished
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Cached data is cleared too, so the next person on this browser never sees the previous user's data.
  const clearSession = () => {
    setUser(null);
    queryClient.clear();
  };

  useEffect(() => {
    setSessionExpiredHandler(clearSession);
    // After a page reload there is no access token in memory, so restore the session from the refresh cookie.
    refreshSession()
      .then((session) => setUser(session.user))
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearSession only touches stable setters and queryClient
  }, [queryClient]);

  const value: AuthState = {
    user,
    loading,
    login: async (email, password) => setUser(await authApi.login(email, password)),
    logout: async () => {
      await authApi.logout();
      clearSession();
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
