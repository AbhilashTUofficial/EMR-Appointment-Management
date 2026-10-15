import { Link } from "react-router";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-sm text-gray-600">That address doesn't match anything here.</p>
      <Link to="/" className="text-sm font-medium text-blue-700 hover:underline">
        Go to the dashboard
      </Link>
    </main>
  );
}
