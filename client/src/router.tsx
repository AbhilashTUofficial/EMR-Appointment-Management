import { Navigate, createBrowserRouter } from "react-router";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";

export const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [{ path: "/", element: <Dashboard /> }],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
