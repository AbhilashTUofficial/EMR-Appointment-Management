import { Navigate, Outlet, useLocation } from "react-router";
import type { Role } from "../api/http";
import { Spinner } from "../components/Spinner";
import { useAuth } from "./AuthContext";

// Route guard. The server checks the token and role on every request; this only keeps people off screens they can't use.
export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search + location.hash }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <Outlet />;
}
