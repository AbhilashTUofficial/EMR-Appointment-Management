import { Navigate, createBrowserRouter } from "react-router";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./components/AppLayout";
import Appointments from "./pages/Appointments";
import Book from "./pages/Book";
import Dashboard from "./pages/Dashboard";
import ErrorPage from "./pages/ErrorPage";
import Login from "./pages/Login";
import Scheduler from "./pages/Scheduler";

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
              // Loaded on demand: only admins ever open these.
              { path: "/admin/doctors", lazy: async () => ({ Component: (await import("./pages/admin/Doctors")).default }) },
              { path: "/admin/doctors/:id/schedule", lazy: async () => ({ Component: (await import("./pages/admin/DoctorSchedule")).default }) },
              { path: "/admin/receptionists", lazy: async () => ({ Component: (await import("./pages/admin/Receptionists")).default }) },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
