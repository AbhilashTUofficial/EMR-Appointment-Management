import { useState } from "react";
import { useSearchParams } from "react-router";
import type { Appointment } from "../api/appointments";
import { useAuth } from "../auth/AuthContext";
import { AppointmentEditor } from "../components/AppointmentEditor";
import { AppointmentRow } from "../components/AppointmentRow";
import { Button } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { Input } from "../components/Input";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { Select } from "../components/Select";
import { Spinner } from "../components/Spinner";
import { statusLabels } from "../components/StatusBadge";
import { useAppointmentActions } from "../hooks/useAppointmentActions";
import { useAppointments, useDepartments, useSummary } from "../hooks/queries";

const filterNames = ["patient", "mobile", "doctor", "departmentId", "status", "from", "to"] as const;

export default function Appointments() {
  const { user } = useAuth();
  const isDoctor = user?.role === "DOCTOR";
  const [params, setParams] = useSearchParams();
  const departments = useDepartments();
  const appointments = useAppointments(params.toString());
  const actions = useAppointmentActions();
  const today = useSummary().data?.date; // the clinic's date, which decides when a patient can be marked as arrived
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [showFilters, setShowFilters] = useState(false); // on a phone the filters start folded away

  const sortColumn = params.get("sortBy") ?? "date";
  const sortOrder = params.get("order") ?? "desc";

  // The filters, sort and page all live in the URL, so a filtered list can be bookmarked or shared.
  const applyFilters = (form: FormData) => {
    const next = new URLSearchParams();
    filterNames.forEach((name) => {
      const value = String(form.get(name) ?? "").trim();
      if (value) next.set(name, value);
    });
    ["sortBy", "order"].forEach((name) => params.has(name) && next.set(name, params.get(name)!));
    setParams(next);
  };

  const sortBy = (column: "date" | "status") => {
    const next = new URLSearchParams(params);
    next.set("sortBy", column);
    next.set("order", sortColumn === column && sortOrder === "desc" ? "asc" : "desc");
    next.delete("page");
    setParams(next);
  };

  const setPage = (page: number) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("page", String(page));
      return next;
    });

  const ariaSort = (column: string) => (sortColumn === column ? (sortOrder === "desc" ? "descending" : "ascending") : undefined);
  const arrow = (column: string) => (sortColumn === column ? (sortOrder === "desc" ? " ▼" : " ▲") : "");

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Appointments</h1>

      <Button type="button" variant="secondary" className="sm:hidden" aria-expanded={showFilters} onClick={() => setShowFilters((open) => !open)}>
        {showFilters ? "Hide filters" : "Show filters"}
      </Button>

      {/* Remounted when the filters in the URL change (for example from a link), so the inputs show what is applied. */}
      <form
        key={filterNames.map((name) => params.get(name)).join("|")}
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters(new FormData(e.currentTarget));
        }}
        className={`gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid sm:grid-cols-2 lg:grid-cols-4 ${showFilters ? "grid" : "hidden"}`}
      >
        <Input label="Patient name or ID" name="patient" defaultValue={params.get("patient") ?? ""} />
        <Input label="Mobile number" name="mobile" defaultValue={params.get("mobile") ?? ""} />
        {!isDoctor && <Input label="Doctor" name="doctor" defaultValue={params.get("doctor") ?? ""} />}
        {!isDoctor && (
          <Select label="Department" name="departmentId" defaultValue={params.get("departmentId") ?? ""}>
            <option value="">All departments</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        )}
        <Select label="Status" name="status" defaultValue={params.get("status") ?? ""}>
          <option value="">Any status</option>
          {Object.entries(statusLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
        <Input label="From" name="from" type="date" defaultValue={params.get("from") ?? ""} />
        <Input label="To" name="to" type="date" defaultValue={params.get("to") ?? ""} />
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          <Button type="button" variant="secondary" onClick={() => setParams(new URLSearchParams())}>
            Clear
          </Button>
        </div>
      </form>

      <ErrorAlert>{actions.error?.message}</ErrorAlert>
      {appointments.isError && <ErrorAlert>{appointments.error.message}</ErrorAlert>}
      {appointments.isPending && <Spinner className="py-10" />}
      {appointments.data?.items.length === 0 && <p className="text-sm text-gray-600">No appointments match these filters.</p>}

      {appointments.data && appointments.data.items.length > 0 && (
        <div className={`overflow-x-auto rounded-lg border border-gray-200 bg-white ${appointments.isPlaceholderData ? "opacity-60" : ""}`}>
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-gray-600">
              <tr>
                <th aria-sort={ariaSort("date")} className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => sortBy("date")}>
                    Date and time{arrow("date")}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">Patient</th>
                {!isDoctor && <th className="px-3 py-2 font-medium">Doctor</th>}
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th aria-sort={ariaSort("status")} className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => sortBy("status")}>
                    Status{arrow("status")}
                  </button>
                </th>
                <th className="sticky right-0 bg-gray-50 px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {appointments.data.items.map((appointment) => (
                <AppointmentRow
                  key={appointment.id}
                  appointment={appointment}
                  isDoctor={!!isDoctor}
                  departmentName={departments.data?.find((d) => d.id === appointment.departmentId)?.name ?? ""}
                  busy={actions.isPending}
                  today={today}
                  onAction={(action, id) => actions.mutate({ action, id })}
                  onEdit={setEditing}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {appointments.data && <Pagination meta={appointments.data.meta} onPage={setPage} />}

      {editing && user && (
        <Modal title={isDoctor ? "Consultation notes" : "Edit appointment"} onClose={() => setEditing(null)}>
          <AppointmentEditor appointment={editing} role={user.role} onDone={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
