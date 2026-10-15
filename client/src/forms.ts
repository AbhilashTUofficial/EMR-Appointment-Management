import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { ApiError } from "./api/http";

// Puts the server's validation messages under the matching inputs.
// Returns a message for the form banner for anything that has no input to attach to.
export function applyServerError<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, fields: string[]) {
  if (!(err instanceof ApiError)) return "Could not reach the server. Try again.";

  const fieldErrors = err.code === "EMAIL_TAKEN" ? [{ field: "email", message: err.message }] : err.errors;
  // The server reports nested fields as "newPatient.mobile"; the form field is just "mobile".
  const named = fieldErrors.map((e) => ({ field: e.field.split(".").pop() ?? e.field, message: e.message }));
  const shown = named.filter((e) => fields.includes(e.field));
  shown.forEach((e) => setError(e.field as Path<T>, { message: e.message }));

  const unattached = named.filter((e) => !fields.includes(e.field)).map((e) => e.message);
  if (unattached.length) return unattached.join(" ");
  return shown.length ? "" : err.message;
}
