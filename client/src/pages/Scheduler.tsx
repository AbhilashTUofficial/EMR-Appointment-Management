import { useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Slot } from "../api/slots";
import { ErrorAlert } from "../components/ErrorAlert";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { SlotGrid, SlotLegend } from "../components/SlotGrid";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../auth/AuthContext";
import { today } from "../format";
import { useDepartments, useDoctors, useSlots, useSummary } from "../hooks/queries";

export default function Scheduler() {
  const { user } = useAuth();
  // The filters live in the URL, so a scheduler view can be bookmarked or shared.
  const [params, setParams] = useSearchParams();
  const department = params.get("department") ?? "";
  // The default is the clinic's date from the server, which can differ from the browser's.
  const clinicToday = useSummary().data?.date;
  const date = params.get("date") ?? clinicToday ?? today();

  const departments = useDepartments();
  const doctors = useDoctors(department || undefined);
  // A doctor only ever sees their own schedule, so there is nothing to choose. For everyone else the
  // doctor in the URL only counts while it is one of the listed doctors, so a stale link shows no slots.
  const chosen = params.get("doctor");
  const doctorId = user?.role === "DOCTOR" ? user.id : doctors.data?.find((d) => d.id === chosen)?.id;
  const slots = useSlots(doctorId, date);

  // Only staff who can book get clickable slots. A stable callback keeps the memoized slot buttons from re-rendering.
  const navigate = useNavigate();
  const canBook = user?.role === "SUPER_ADMIN" || user?.role === "RECEPTIONIST";
  const bookSlot = useCallback(
    (slot: Slot) => navigate(`/book?${new URLSearchParams({ doctorId: doctorId!, date, slot: slot.start })}`),
    [navigate, doctorId, date],
  );

  const setFilter = (changes: Record<string, string>) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
      return next;
    });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Scheduler</h1>

      <div className="grid gap-4 sm:grid-cols-3">
        {user?.role !== "DOCTOR" && (
          <>
            <Select label="Department" value={department} onChange={(e) => setFilter({ department: e.target.value, doctor: "" })}>
              <option value="">All departments</option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
            <Select label="Doctor" value={doctorId ?? ""} onChange={(e) => setFilter({ doctor: e.target.value })}>
              <option value="">Choose a doctor…</option>
              {doctors.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </>
        )}
        <Input label="Date" type="date" value={date} onChange={(e) => e.target.value && setFilter({ date: e.target.value })} />
      </div>

      {departments.isError && <ErrorAlert>{departments.error.message}</ErrorAlert>}
      {doctors.isError && <ErrorAlert>{doctors.error.message}</ErrorAlert>}
      {!doctorId && !doctors.isError && <p className="text-sm text-gray-600">Choose a doctor to see their slots.</p>}
      {slots.isLoading && <Spinner className="py-10" />}
      {slots.isError && <ErrorAlert>{slots.error.message}</ErrorAlert>}
      {slots.data && !slots.data.isWorkingDay && <p className="text-sm text-gray-600">The doctor does not work on this day.</p>}
      {slots.data?.isWorkingDay && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <SlotLegend />
          <SlotGrid data={slots.data} onSelect={canBook ? bookSlot : undefined} />
        </div>
      )}
    </div>
  );
}
