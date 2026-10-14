import { useSearchParams } from "react-router";
import { ErrorAlert } from "../components/ErrorAlert";
import { Input } from "../components/Input";
import { Select } from "../components/Select";
import { SlotGrid, SlotLegend } from "../components/SlotGrid";
import { Spinner } from "../components/Spinner";
import { useAuth } from "../auth/AuthContext";
import { useDepartments, useDoctors, useSlots } from "../hooks/queries";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in the browser's timezone

export default function Scheduler() {
  const { user } = useAuth();
  // The filters live in the URL, so a scheduler view can be bookmarked or shared.
  const [params, setParams] = useSearchParams();
  const department = params.get("department") ?? "";
  const date = params.get("date") ?? today();

  const departments = useDepartments();
  const doctors = useDoctors(department || undefined);
  // A doctor only ever sees their own schedule, so there is nothing to choose.
  const doctorId = user?.role === "DOCTOR" ? doctors.data?.[0]?.id : params.get("doctor") || undefined;
  const slots = useSlots(doctorId, date);

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
        <Input label="Date" type="date" value={date} onChange={(e) => setFilter({ date: e.target.value })} />
      </div>

      {!doctorId && <p className="text-sm text-gray-600">Choose a doctor to see their slots.</p>}
      {slots.isFetching && !slots.data && <Spinner className="py-10" />}
      {slots.isError && <ErrorAlert>{slots.error.message}</ErrorAlert>}
      {slots.data && !slots.data.isWorkingDay && <p className="text-sm text-gray-600">The doctor does not work on this day.</p>}
      {slots.data?.isWorkingDay && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <SlotLegend />
          <SlotGrid data={slots.data} />
        </div>
      )}
    </div>
  );
}
