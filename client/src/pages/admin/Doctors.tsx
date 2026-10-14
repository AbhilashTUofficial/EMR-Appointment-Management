import { useState } from "react";
import { Link } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { createDoctor } from "../../api/doctors";
import { Button } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Spinner } from "../../components/Spinner";
import { StaffForm } from "../../components/StaffForm";
import { summarizeDays } from "../../days";
import { useDepartments, useDoctors } from "../../hooks/queries";

export default function Doctors() {
  const queryClient = useQueryClient();
  const doctors = useDoctors();
  const departments = useDepartments();
  const [adding, setAdding] = useState(false);

  const departmentName = (id: string) => departments.data?.find((d) => d._id === id)?.name;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Doctors</h1>
        {!adding && <Button onClick={() => setAdding(true)}>Add doctor</Button>}
      </div>

      {adding && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-3 font-medium">New doctor</h2>
          <StaffForm
            withDoctorFields
            submitLabel="Create doctor"
            onCancel={() => setAdding(false)}
            onSubmit={async (values) => {
              await createDoctor(values);
              await queryClient.invalidateQueries({ queryKey: ["doctors"] });
              setAdding(false);
            }}
          />
        </section>
      )}

      {doctors.isPending && <Spinner className="py-10" />}
      {doctors.isError && <ErrorAlert>{doctors.error.message}</ErrorAlert>}
      {doctors.data?.length === 0 && <p className="text-sm text-gray-600">No doctors yet.</p>}

      <ul className="grid gap-3 sm:grid-cols-2">
        {doctors.data?.map((doctor) => (
          <li key={doctor.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{doctor.name}</p>
                <p className="text-sm text-gray-600">{[departmentName(doctor.departmentId), doctor.specialization].filter(Boolean).join(" · ")}</p>
                <p className="text-sm text-gray-500">{doctor.email}</p>
              </div>
              <Link
                to={`/admin/doctors/${doctor.id}/schedule`}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Schedule
              </Link>
            </div>
            <p className="mt-3 text-sm text-gray-700">
              {summarizeDays(doctor.workingDays)} · {doctor.slotDurationMinutes} min slots
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
