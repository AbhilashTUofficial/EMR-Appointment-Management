import { useAuth } from "../auth/AuthContext";

export default function Dashboard() {
  const { user } = useAuth();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Welcome, {user?.name}</h1>
      <p className="mt-1 text-sm text-gray-600">Appointment screens will appear here as they are built.</p>
    </div>
  );
}
