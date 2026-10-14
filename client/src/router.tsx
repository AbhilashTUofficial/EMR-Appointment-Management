import { Navigate, createBrowserRouter } from "react-router";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./components/AppLayout";
import Appointments from "./pages/Appointments";
import Book from "./pages/Book";
import Dashboard from "./pages/Dashboard";
import ErrorPage from "./pages/ErrorPage";
import Login from "./pages/Login";
import Scheduler from "./pages/Scheduler";
import DoctorSchedule from "./pages/admin/DoctorSchedule";
import Doctors from "./pages/admin/Doctors";
import Receptionists from "./pages/admin/Receptionists";

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
              { path: "/admin/doctors", element: <Doctors /> },
              { path: "/admin/doctors/:id/schedule", element: <DoctorSchedule /> },
              { path: "/admin/receptionists", element: <Receptionists /> },
            ],
          },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
