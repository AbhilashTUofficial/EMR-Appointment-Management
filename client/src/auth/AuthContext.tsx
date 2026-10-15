import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as authApi from "../api/auth";
import { refreshSession, setAccessToken, setSessionExpiredHandler, type User } from "../api/http";

type AuthState = {
  user: User | null;
  loading: boolean; // true until the first refresh attempt has finished
  signedOut: boolean; // the user chose to sign out, as opposed to the session simply ending
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>; // rejects if the server could not be reached, because the session would still be open
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signedOut, setSignedOut] = useState(false);
  const otherTabs = useRef<BroadcastChannel | null>(null);

  // Cached data is cleared too, so the next person on this browser never sees the previous user's data.
  const clearSession = () => {
    setAccessToken(null);
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

    // Signing out in one tab signs out the others, which would otherwise keep showing patient data.
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel("emr-auth");
      channel.onmessage = () => {
        setSignedOut(true);
        clearSession();
      };
      otherTabs.current = channel;
      return () => channel.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearSession only touches stable setters and queryClient
  }, [queryClient]);

  const value: AuthState = {
    user,
    loading,
    signedOut,
    login: async (email, password) => {
      setUser(await authApi.login(email, password));
      setSignedOut(false);
    },
    logout: async () => {
      await authApi.logout();
      setSignedOut(true);
      clearSession();
      otherTabs.current?.postMessage("signed-out");
    },
  };

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
