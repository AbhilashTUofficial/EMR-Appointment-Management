import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { updateSchedule, type Doctor, type TimeRange, type WorkingDay } from "../../api/doctors";
import { ApiError } from "../../api/http";
import { Button } from "../../components/Button";
import { ErrorAlert } from "../../components/ErrorAlert";
import { controlClass } from "../../components/Field";
import { Select } from "../../components/Select";
import { Spinner } from "../../components/Spinner";
import { DAY_NAMES, WEEK_ORDER } from "../../days";
import { useDoctors } from "../../hooks/queries";

type DayState = Omit<WorkingDay, "day">;

const SLOT_LENGTHS = [5, 10, 15, 20, 30, 45, 60, 90, 120];

export default function DoctorSchedule() {
  const { id } = useParams();
  const doctors = useDoctors();
  const doctor = doctors.data?.find((d) => d.id === id);

  if (doctors.isPending) return <Spinner className="py-10" />;
  if (doctors.isError) return <ErrorAlert>{doctors.error.message}</ErrorAlert>;
  if (!doctor) return <ErrorAlert>Doctor not found.</ErrorAlert>;
  return <ScheduleEditor doctor={doctor} />;
}

function ScheduleEditor({ doctor }: { doctor: Doctor }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [slotDuration, setSlotDuration] = useState(doctor.slotDurationMinutes);
  const [days, setDays] = useState<Record<number, DayState>>(() =>
    Object.fromEntries(doctor.workingDays.map((d) => [d.day, { sessions: d.sessions, breaks: d.breaks }])),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const setDay = (day: number, state: DayState | null) =>
    setDays((current) => {
      const next = { ...current };
      if (state) next[day] = state;
      else delete next[day];
      return next;
    });

  const copyToAllWorkingDays = (source: DayState) =>
    setDays((current) => Object.fromEntries(Object.keys(current).map((day) => [day, source])));

  const save = async () => {
    const workingDays: WorkingDay[] = WEEK_ORDER.filter((day) => days[day]).map((day) => ({ day, ...days[day] }));
    setSaving(true);
    setErrors([]);
    try {
      await updateSchedule(doctor.id, { slotDurationMinutes: slotDuration, workingDays });
      await queryClient.invalidateQueries({ queryKey: ["doctors"] });
      navigate("/admin/doctors");
    } catch (err) {
      setErrors(describeErrors(err, workingDays));
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link to="/admin/doctors" className="text-sm text-blue-700 hover:underline">
          ← Doctors
        </Link>
        <h1 className="text-2xl font-semibold">Schedule for {doctor.name}</h1>
      </div>

      <Select
        label="Slot length"
        className="max-w-xs"
        value={slotDuration}
        onChange={(e) => setSlotDuration(Number(e.target.value))}
      >
        {SLOT_LENGTHS.map((minutes) => (
          <option key={minutes} value={minutes}>
            {minutes} minutes
          </option>
        ))}
      </Select>

      <div className="space-y-3">
        {WEEK_ORDER.map((day) => {
          const state = days[day];
          return (
            <section key={day} className="rounded-lg border border-gray-200 bg-white p-4">
              <label className="flex items-center gap-2 font-medium">
                <input
                  type="checkbox"
                  checked={!!state}
                  onChange={(e) =>
                    setDay(day, e.target.checked ? { sessions: [{ name: "Morning", start: "09:00", end: "13:00" }], breaks: [] } : null)
                  }
                />
                {DAY_NAMES[day]}
              </label>
              {state && (
                <div className="mt-3 space-y-4">
                  <RangeList
                    noun="session"
                    ranges={state.sessions}
                    onChange={(sessions) => setDay(day, { ...state, sessions })}
                  />
                  <RangeList
                    noun="break"
                    ranges={state.breaks}
                    onChange={(breaks) => setDay(day, { ...state, breaks })}
                  />
                  <button type="button" onClick={() => copyToAllWorkingDays(state)} className="text-sm text-blue-700 hover:underline">
                    Use this for all working days
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {errors.length > 0 && (
        <ErrorAlert>
          <ul className="list-inside list-disc">
            {errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </ErrorAlert>
      )}

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save schedule"}
        </Button>
        <Button variant="secondary" onClick={() => navigate("/admin/doctors")}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// What a newly added session or break starts as: the afternoon, and a short break inside the morning.
const newRange: Record<string, { start: string; end: string }> = {
  session: { start: "14:00", end: "17:00" },
  break: { start: "11:00", end: "11:15" },
};

function RangeField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs text-gray-500">
      <span className="mb-0.5 block">{label}</span>
      {children}
    </label>
  );
}

// Used for both sessions and breaks: a list of named time ranges.
function RangeList({
  noun,
  ranges,
  onChange,
}: {
  noun: string;
  ranges: TimeRange[];
  onChange: (ranges: TimeRange[]) => void;
}) {
  const title = `${noun[0].toUpperCase()}${noun.slice(1)}s`;
  const update = (index: number, patch: Partial<TimeRange>) =>
    onChange(ranges.map((range, i) => (i === index ? { ...range, ...patch } : range)));

  return (
    <div>
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {noun === "break" && <p className="mb-1 text-xs text-gray-500">Slots that touch a break are not offered. A break can sit inside a session or in the gap between two.</p>}
      <div className="space-y-2">
        {ranges.map((range, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-[10rem_8rem_8rem_auto] sm:items-end">
            <RangeField label="Name">
              <input aria-label={`${noun} name`} className={controlClass} value={range.name} onChange={(e) => update(index, { name: e.target.value })} />
            </RangeField>
            <RangeField label="From">
              <input aria-label={`${noun} start`} type="time" className={controlClass} value={range.start} onChange={(e) => update(index, { start: e.target.value })} />
            </RangeField>
            <RangeField label="To">
              <input aria-label={`${noun} end`} type="time" className={controlClass} value={range.end} onChange={(e) => update(index, { end: e.target.value })} />
            </RangeField>
            <button
              type="button"
              aria-label={`Remove ${noun} ${index + 1}`}
              onClick={() => onChange(ranges.filter((_, i) => i !== index))}
              className="justify-self-start px-2 py-2 text-sm text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...ranges, { name: noun[0].toUpperCase() + noun.slice(1), ...newRange[noun] }])}
        className="mt-2 text-sm text-blue-700 hover:underline"
      >
        + Add {noun}
      </button>
    </div>
  );
}

// Turns the server's field paths ("workingDays.0.sessions.1.end") into sentences a person can act on.
function describeErrors(err: unknown, workingDays: WorkingDay[]) {
  if (!(err instanceof ApiError)) return ["Could not reach the server. Try again."];
  if (!err.errors.length) return [err.message];

  return err.errors.map(({ field, message }) => {
    const match = field.match(/^workingDays\.(\d+)(?:\.(sessions|breaks)(?:\.(\d+))?)?/);
    if (!match) return `${field}: ${message}`;

    const [, dayIndex, kind, rangeIndex] = match;
    const dayName = DAY_NAMES[workingDays[Number(dayIndex)]?.day] ?? "Schedule";
    const noun = kind === "breaks" ? "break" : "session";
    const where = !kind ? dayName : rangeIndex === undefined ? `${dayName} ${noun}s` : `${dayName} ${noun} ${Number(rangeIndex) + 1}`;
    return `${where}: ${message}`;
  });
}
