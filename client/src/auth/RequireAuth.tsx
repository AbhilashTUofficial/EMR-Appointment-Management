import { Navigate, Outlet, useLocation } from "react-router";
import type { Role } from "../api/http";
import { Spinner } from "../components/Spinner";
import { useAuth } from "./AuthContext";

// Route guard. The server checks the token and role on every request; this only keeps people off screens they can't use.
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading, signedOut } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner className="min-h-dvh" />;
  if (!user) {
    // After a deliberate sign-out the next person starts from the dashboard, not the last user's page.
    // If the session just ran out, sending them back to where they were is what they want.
    const from = location.pathname + location.search + location.hash;
    return <Navigate to="/login" state={signedOut ? undefined : { from }} replace />;
  }
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
