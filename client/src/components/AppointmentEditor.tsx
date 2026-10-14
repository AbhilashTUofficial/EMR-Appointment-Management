import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { updateAppointment, type Appointment } from "../api/appointments";
import type { Role } from "../api/http";
import { applyServerError } from "../forms";
import { Button } from "./Button";
import { ErrorAlert } from "./ErrorAlert";
import { Input } from "./Input";
import { Textarea } from "./Textarea";

const schema = z.object({
  purpose: z.string().trim().max(500),
  notes: z.string().trim().max(1000),
  consultationNotes: z.string().trim().max(5000),
});
type Values = z.infer<typeof schema>;

type Props = { appointment: Appointment; role: Role; onDone: () => void };

// The front desk edits the booking details; the doctor edits the consultation notes.
export function AppointmentEditor({ appointment, role, onDone }: Props) {
  const queryClient = useQueryClient();
  const isDoctor = role === "DOCTOR";
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      purpose: appointment.purpose,
      notes: appointment.notes ?? "",
      consultationNotes: appointment.consultationNotes ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setServerError("");
    if (!isDoctor && !values.purpose) return setError("purpose", { message: "Enter the purpose of the visit" });

    try {
      await updateAppointment(appointment.id, isDoctor ? { consultationNotes: values.consultationNotes } : { purpose: values.purpose, notes: values.notes });
      await queryClient.invalidateQueries({ queryKey: ["appointments"] });
      onDone();
    } catch (err) {
      setServerError(applyServerError(err, setError, ["purpose", "notes", "consultationNotes"]));
    }
  });

  return (
    <form onSubmit={(e) => !isSubmitting && submit(e)} noValidate className="space-y-4">
      <p className="text-sm text-gray-600">
        {appointment.patient.name} · {appointment.date} {appointment.slotStart}
      </p>
      {isDoctor ? (
        <Textarea label="Consultation notes" rows={6} error={errors.consultationNotes?.message} {...register("consultationNotes")} />
      ) : (
        <>
          <Input label="Purpose of visit" error={errors.purpose?.message} {...register("purpose")} />
          <Textarea label="Notes" error={errors.notes?.message} {...register("notes")} />
        </>
      )}
      <ErrorAlert>{serverError}</ErrorAlert>
      <div className="flex gap-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
