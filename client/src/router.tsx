import { Navigate, createBrowserRouter } from "react-router";
import { RequireAuth } from "./auth/RequireAuth";
import { AppLayout } from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import ErrorPage from "./pages/ErrorPage";
import Login from "./pages/Login";

export const router = createBrowserRouter([
  { path: "/login", element: <Login />, errorElement: <ErrorPage /> },
  {
    element: <RequireAuth />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [{ path: "/", element: <Dashboard /> }],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
