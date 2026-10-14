import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useLocation } from "react-router";
import { ApiError } from "../api/http";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { Input } from "../components/Input";
import { Spinner } from "../components/Spinner";

const schema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});
type FormValues = z.infer<typeof schema>;

export default function Login() {
  const { user, loading, login } = useAuth();
  const state: { from?: string } | null = useLocation().state;
  const from = state?.from ?? "/";
  const [serverError, setServerError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  // Wait for the session restore so the form never flashes for someone who is already signed in.
  if (loading) return <Spinner className="min-h-dvh" />;
  if (user) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError("");
    try {
      await login(email, password); // the redirect below runs once the user is set
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Could not reach the server. Try again.");
    }
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-50 px-4">
      <form onSubmit={onSubmit} noValidate className="w-full max-w-sm space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold">EMR Appointments</h1>
          <p className="text-sm text-gray-500">Sign in to continue</p>
        </div>
        <Input label="Email" type="email" autoComplete="username" error={errors.email?.message} {...register("email")} />
        <Input label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register("password")} />
        <ErrorAlert>{serverError}</ErrorAlert>
        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
