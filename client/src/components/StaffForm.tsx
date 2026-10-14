import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useDepartments } from "../hooks/queries";
import { applyServerError } from "../forms";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Input } from "./Input";
import { Select } from "./Select";

const receptionistSchema = z.object({
  name: z.string().trim().min(2, "Enter a name"),
  email: z.email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});
// The department is only required for doctors, so it is checked on submit rather than in the schema.
const schema = receptionistSchema.extend({ departmentId: z.string().optional(), specialization: z.string().optional() });

type StaffValues = z.infer<typeof schema>;

type Props = {
  withDoctorFields?: boolean;
  submitLabel: string;
  onSubmit: (values: StaffValues) => Promise<unknown>;
  onCancel?: () => void;
};

// One form for both account types; doctors also get a department and specialization.
export function StaffForm({ withDoctorFields, submitLabel, onSubmit, onCancel }: Props) {
  const departments = useDepartments();
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StaffValues>({ resolver: zodResolver(schema) });

  const submit = handleSubmit(async (values) => {
    setServerError("");
    if (withDoctorFields && !values.departmentId) return setError("departmentId", { message: "Choose a department" });
    try {
      await onSubmit(values);
      reset();
    } catch (err) {
      setServerError(applyServerError(err, setError, ["name", "email", "password", "departmentId", "specialization"]));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
      <Input label="Full name" autoComplete="off" error={errors.name?.message} {...register("name")} />
      <Input label="Email" type="email" autoComplete="off" error={errors.email?.message} {...register("email")} />
      <Input label="Temporary password" type="password" autoComplete="new-password" error={errors.password?.message} {...register("password")} />
      {withDoctorFields && (
        <>
          <Select label="Department" error={errors.departmentId?.message} {...register("departmentId")}>
            <option value="">Choose…</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          <Input label="Specialization (optional)" error={errors.specialization?.message} {...register("specialization")} />
        </>
      )}
      <div className="space-y-3 sm:col-span-2">
        <ErrorAlert>{serverError}</ErrorAlert>
        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving…" : submitLabel}
          </Button>
          {onCancel && (
            <Button type="button" variant="secondary" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
