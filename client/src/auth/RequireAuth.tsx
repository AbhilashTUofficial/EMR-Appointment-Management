import { Navigate, Outlet, useLocation } from "react-router";
import { Spinner } from "../components/Spinner";
import { useAuth } from "./AuthContext";

// Route guard. The server checks the token and role on every request; this only keeps signed-out users off the screens.
export function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search + location.hash }} replace />;
  return <Outlet />;
}
