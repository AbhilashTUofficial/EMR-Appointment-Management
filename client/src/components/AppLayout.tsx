import { useState } from "react";
import { NavLink, Outlet } from "react-router";
import type { Role } from "../api/http";
import { useAuth } from "../auth/AuthContext";
import { useRealtime } from "../hooks/useRealtime";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";

const links: { to: string; label: string; roles?: Role[] }[] = [
  { to: "/", label: "Dashboard" },
  { to: "/scheduler", label: "Scheduler" },
  { to: "/appointments", label: "Appointments" },
  { to: "/admin/doctors", label: "Doctors", roles: ["SUPER_ADMIN"] },
  { to: "/admin/receptionists", label: "Receptionists", roles: ["SUPER_ADMIN"] },
];

const roleLabel: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  RECEPTIONIST: "Receptionist",
  DOCTOR: "Doctor",
};

export function AppLayout() {
  const { user, logout } = useAuth();
  const live = useRealtime();
  const [signOutError, setSignOutError] = useState("");
  if (!user) return null;

  // If the server can't be reached the sign-in cookie would stay valid, so say so instead of pretending.
  const signOut = async () => {
    setSignOutError("");
    try {
      await logout();
    } catch {
      setSignOutError("Could not sign out. Check your connection and try again.");
    }
  };

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold text-blue-700">EMR Appointments</span>
          <nav aria-label="Main" className="flex flex-1 gap-4 text-sm">
            {links.filter((link) => !link.roles || link.roles.includes(user.role)).map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end
                className={({ isActive }) => (isActive ? "font-medium text-blue-700" : "text-gray-600 hover:text-gray-900")}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-700">
              {user.name}
              {user.name !== roleLabel[user.role] && <span className="text-gray-500"> ({roleLabel[user.role]})</span>}
            </span>
            <Button variant="secondary" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      {!live && (
        <p role="status" className="bg-amber-50 px-4 py-1.5 text-center text-sm text-amber-800">
          Live updates are paused while reconnecting. Reload if the screen looks out of date.
        </p>
      )}
      <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">
        <ErrorAlert>{signOutError}</ErrorAlert>
        <Outlet />
      </main>
    </div>
  );
}
