import { useState } from "react";
import { useSearchParams } from "react-router";
import type { Appointment } from "../api/appointments";
import { useAuth } from "../auth/AuthContext";
import { AppointmentEditor } from "../components/AppointmentEditor";
import { Button } from "../components/Button";
import { ErrorAlert } from "../components/ErrorAlert";
import { Input } from "../components/Input";
import { Modal } from "../components/Modal";
import { Pagination } from "../components/Pagination";
import { Select } from "../components/Select";
import { Spinner } from "../components/Spinner";
import { StatusBadge, statusLabels } from "../components/StatusBadge";
import { formatDate } from "../format";
import { useAppointmentActions } from "../hooks/useAppointmentActions";
import { useAppointments, useDepartments } from "../hooks/queries";

const today = () => new Date().toLocaleDateString("en-CA");
const filterNames = ["patient", "mobile", "doctor", "departmentId", "status", "from", "to"] as const;

export default function Appointments() {
  const { user } = useAuth();
  const isDoctor = user?.role === "DOCTOR";
  const [params, setParams] = useSearchParams();
  const departments = useDepartments();
  const appointments = useAppointments(params.toString());
  const actions = useAppointmentActions();
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);

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
    const sameColumn = (params.get("sortBy") ?? "date") === column;
    next.set("sortBy", column);
    next.set("order", sameColumn && (params.get("order") ?? "desc") === "desc" ? "asc" : "desc");
    next.delete("page");
    setParams(next);
  };

  const setPage = (page: number) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.set("page", String(page));
      return next;
    });

  const arrow = (column: string) => ((params.get("sortBy") ?? "date") === column ? ((params.get("order") ?? "desc") === "desc" ? " ▼" : " ▲") : "");
  const departmentName = (id: string) => departments.data?.find((d) => d.id === id)?.name ?? "";
  const run = (action: "arrive" | "cancel" | "complete", id: string) => {
    setConfirmingCancel(null);
    actions.mutate({ action, id });
  };

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Appointments</h1>

      {/* Remounted when the URL's filters change (for example from a link), so the inputs show what is applied. */}
      <form
        key={filterNames.map((name) => params.get(name)).join("|")}
        onSubmit={(e) => {
          e.preventDefault();
          applyFilters(new FormData(e.currentTarget));
        }}
        className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4"
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
                <th className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => sortBy("date")}>
                    Date and time{arrow("date")}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">Patient</th>
                {!isDoctor && <th className="px-3 py-2 font-medium">Doctor</th>}
                <th className="px-3 py-2 font-medium">Purpose</th>
                <th className="px-3 py-2 font-medium">
                  <button type="button" onClick={() => sortBy("status")}>
                    Status{arrow("status")}
                  </button>
                </th>
                <th className="px-3 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {appointments.data.items.map((a) => {
                const frontDesk = !isDoctor;
                const canEdit = frontDesk ? a.status === "SCHEDULED" || a.status === "ARRIVED" : a.status === "ARRIVED" || a.status === "COMPLETED";
                return (
                  <tr key={a.id} className="align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {formatDate(a.date)}
                      <br />
                      <span className="text-gray-500">
                        {a.slotStart}–{a.slotEnd}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{a.patient.name}</span>
                      <br />
                      <span className="text-gray-500">
                        {a.patient.patientCode} · {a.patient.mobile}
                      </span>
                    </td>
                    {!isDoctor && (
                      <td className="px-3 py-2">
                        {a.doctor.name}
                        <br />
                        <span className="text-gray-500">{departmentName(a.departmentId)}</span>
                      </td>
                    )}
                    <td className="px-3 py-2">{a.purpose}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={a.status} />
                    </td>
                    <td className="px-3 py-2">
                      {confirmingCancel === a.id ? (
                        <span className="flex items-center gap-2 whitespace-nowrap">
                          Cancel this appointment?
                          <Button className="px-2 py-1 text-xs" onClick={() => run("cancel", a.id)}>
                            Yes, cancel
                          </Button>
                          <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setConfirmingCancel(null)}>
                            Keep
                          </Button>
                        </span>
                      ) : (
                        <span className="flex flex-wrap gap-2">
                          {frontDesk && a.status === "SCHEDULED" && a.date === today() && (
                            <Button className="px-2 py-1 text-xs" disabled={actions.isPending} onClick={() => run("arrive", a.id)}>
                              Mark arrived
                            </Button>
                          )}
                          {isDoctor && a.status === "ARRIVED" && (
                            <Button className="px-2 py-1 text-xs" disabled={actions.isPending} onClick={() => run("complete", a.id)}>
                              Complete
                            </Button>
                          )}
                          {canEdit && (
                            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setEditing(a)}>
                              {isDoctor ? "Notes" : "Edit"}
                            </Button>
                          )}
                          {frontDesk && a.status === "SCHEDULED" && (
                            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setConfirmingCancel(a.id)}>
                              Cancel
                            </Button>
                          )}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
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
