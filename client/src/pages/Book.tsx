import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { createAppointment, type Appointment, type NewAppointment } from "../api/appointments";
import type { Patient } from "../api/patients";
import { Button } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { Input } from "../components/Input";
import { PatientPicker } from "../components/PatientPicker";
import { Select } from "../components/Select";
import { Textarea } from "../components/Textarea";
import { applyServerError } from "../forms";
import { useDoctors } from "../hooks/queries";

type Mode = "existing" | "new";

const fields = z.object({
  patientId: z.string().optional(),
  name: z.string().trim().optional(),
  mobile: z.string().trim().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  purpose: z.string().trim().min(1, "Enter the purpose of the visit").max(500),
  notes: z.string().trim().max(1000).optional(),
});
type Values = z.infer<typeof fields>;

// Which patient fields are required depends on whether the patient already exists.
const schemaFor = (mode: Mode) =>
  fields.superRefine((values, ctx) => {
    const reject = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (mode === "existing") {
      if (!values.patientId) reject("patientId", "Choose a patient");
      return;
    }
    if ((values.name ?? "").length < 2) reject("name", "Enter the patient's name");
    if (!/^\+?\d{10,15}$/.test((values.mobile ?? "").replace(/[\s-]/g, ""))) reject("mobile", "Enter a valid mobile number");
    if (!values.gender) reject("gender", "Choose a gender");
  });

const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

export default function Book() {
  const [params] = useSearchParams();
  const doctorId = params.get("doctorId");
  const date = params.get("date");
  const slot = params.get("slot");
  const doctors = useDoctors();
  const [mode, setMode] = useState<Mode>("existing");
  const [booked, setBooked] = useState<Appointment | null>(null);

  // The link normally comes from the scheduler; anything else is rejected here instead of after the form is filled in.
  const validLink = doctorId && date && slot && /^\d{4}-\d{2}-\d{2}$/.test(date) && /^\d{2}:\d{2}$/.test(slot);
  if (!validLink) {
    return (
      <div className="space-y-3">
        <ErrorAlert>Choose a slot in the scheduler first.</ErrorAlert>
        <Link to="/scheduler" className="text-sm text-blue-700 hover:underline">
          Go to the scheduler
        </Link>
      </div>
    );
  }

  const doctor = doctors.data?.find((d) => d.id === doctorId);
  const schedulerLink = `/scheduler?${new URLSearchParams({ doctor: doctorId, date })}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link to={schedulerLink} className="text-sm text-blue-700 hover:underline">
          ← Scheduler
        </Link>
        <h1 className="text-2xl font-semibold">Book appointment</h1>
        <p className="mt-1 text-sm text-gray-600">
          {doctor?.name ?? "Doctor"} · {formatDate(date)} · {slot}
        </p>
      </div>

      {booked ? (
        <section role="status" className="space-y-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">Appointment booked</p>
          <p>
            {booked.patient.name} ({booked.patient.patientCode}) with {booked.doctor.name} on {formatDate(booked.date)}, {booked.slotStart}–{booked.slotEnd}.
          </p>
          <Link to={schedulerLink} className="inline-block font-medium text-green-900 underline">
            Back to the scheduler
          </Link>
        </section>
      ) : (
        <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex gap-2" role="group" aria-label="Patient type">
            {(["existing", "new"] as const).map((option) => (
              <Button key={option} type="button" variant={mode === option ? "primary" : "secondary"} aria-pressed={mode === option} onClick={() => setMode(option)}>
                {option === "existing" ? "Existing patient" : "New patient"}
              </Button>
            ))}
          </div>
          <BookingForm key={mode} mode={mode} slot={{ doctorId, date, slotStart: slot }} schedulerLink={schedulerLink} onBooked={setBooked} />
        </section>
      )}
    </div>
  );
}

type FormProps = {
  mode: Mode;
  slot: Pick<NewAppointment, "doctorId" | "date" | "slotStart">;
  schedulerLink: string;
  onBooked: (appointment: Appointment) => void;
};

function BookingForm({ mode, slot, schedulerLink, onBooked }: FormProps) {
  const queryClient = useQueryClient();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [serverError, setServerError] = useState("");
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schemaFor(mode)) });

  const submit = handleSubmit(async (values) => {
    setServerError("");
    const { name, mobile, gender, dateOfBirth, patientId, ...visit } = values;
    try {
      const appointment = await createAppointment({
        ...slot,
        ...visit,
        ...(mode === "existing" ? { patientId } : { newPatient: { name: name!, mobile: mobile!, gender: gender!, dateOfBirth: dateOfBirth || undefined } }),
      });
      onBooked(appointment);
    } catch (err) {
      setServerError(applyServerError(err, setError, ["patientId", "name", "mobile", "gender", "dateOfBirth", "purpose", "notes"]));
    } finally {
      // Whether it worked or the slot was just taken, the scheduler's picture of the day is out of date.
      await queryClient.invalidateQueries({ queryKey: ["slots"] });
    }
  });

  return (
    // Pressing Enter twice would otherwise send the booking twice.
    <form onSubmit={(e) => !isSubmitting && submit(e)} noValidate className="space-y-4">
      {mode === "existing" ? (
        <PatientPicker
          selected={patient}
          error={errors.patientId?.message}
          onSelect={(chosen) => {
            setPatient(chosen);
            setValue("patientId", chosen?.id, { shouldValidate: true });
          }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Full name" autoComplete="off" error={errors.name?.message} {...register("name")} />
          <Input label="Mobile number" type="tel" autoComplete="off" error={errors.mobile?.message} {...register("mobile")} />
          <Select label="Gender" error={errors.gender?.message} {...register("gender")}>
            <option value="">Choose…</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </Select>
          <Input label="Date of birth (optional)" type="date" error={errors.dateOfBirth?.message} {...register("dateOfBirth")} />
        </div>
      )}

      <Input label="Purpose of visit" error={errors.purpose?.message} {...register("purpose")} />
      <Textarea label="Notes (optional)" error={errors.notes?.message} {...register("notes")} />

      <ErrorAlert>
        {serverError}
        {serverError && (
          <>
            {" "}
            <Link to={schedulerLink} className="font-medium underline">
              Back to the scheduler
            </Link>
          </>
        )}
      </ErrorAlert>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Booking…" : "Book appointment"}
      </Button>
    </form>
  );
}
