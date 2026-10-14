import { useRouteError } from "react-router";
import { Button } from "../components/Button";

// Shown by the router when a screen throws while rendering.
export default function ErrorPage() {
  console.error(useRouteError());
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-gray-600">Reload the page and try again.</p>
      <Button onClick={() => window.location.assign("/")}>Reload</Button>
    </main>
  );
}
