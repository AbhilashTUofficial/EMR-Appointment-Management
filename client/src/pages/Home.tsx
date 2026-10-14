import { useQuery } from "@tanstack/react-query";
import { http } from "../api/http";

export default function Home() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => http<{ status: string }>("/health"),
  });

  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-semibold">EMR Appointments</h1>
      <p className="mt-2 text-sm text-gray-600">
        API: {health.isPending ? "checking…" : health.isError ? "unreachable" : health.data.data.status}
      </p>
    </main>
  );
}
