import { createBrowserRouter } from "react-router";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./components/AppLayout";
import Appointments from "./pages/Appointments";
import Book from "./pages/Book";
import Dashboard from "./pages/Dashboard";
import ErrorPage from "./pages/ErrorPage";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Scheduler from "./pages/Scheduler";

// A route whose screen is only downloaded when it is first opened.
const onDemand = (load: () => Promise<{ default: React.ComponentType }>) => ({
  lazy: async () => ({ Component: (await load()).default }),
});

export const router = createBrowserRouter([
  { path: "/login", element: <Login />, errorElement: <ErrorPage /> },
  {
    element: <RequireAuth />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: "/", element: <Dashboard /> },
          { path: "/scheduler", element: <Scheduler /> },
          { path: "/appointments", element: <Appointments /> },
          {
            element: <RequireAuth roles={["SUPER_ADMIN", "RECEPTIONIST"]} />,
            children: [{ path: "/book", element: <Book /> }],
          },
          {
            element: <RequireAuth roles={["SUPER_ADMIN"]} />,
            children: [
              // Only admins ever open these, so they load on demand.
              { path: "/admin/doctors", ...onDemand(() => import("./pages/admin/Doctors")) },
              { path: "/admin/doctors/:id/schedule", ...onDemand(() => import("./pages/admin/DoctorSchedule")) },
              { path: "/admin/receptionists", ...onDemand(() => import("./pages/admin/Receptionists")) },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);
