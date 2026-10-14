import { NavLink, Outlet } from "react-router";
import type { Role } from "../api/http";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./Button";

const links = [{ to: "/", label: "Dashboard" }];

const roleLabel: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  RECEPTIONIST: "Receptionist",
  DOCTOR: "Doctor",
};

export function AppLayout() {
  const { user, logout } = useAuth();
  if (!user) return null;

  return (
    <div className="min-h-dvh bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="font-semibold text-blue-700">EMR Appointments</span>
          <nav aria-label="Main" className="flex flex-1 gap-4 text-sm">
            {links.map((link) => (
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
              {user.name} <span className="text-gray-500">({roleLabel[user.role]})</span>
            </span>
            <Button variant="secondary" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
