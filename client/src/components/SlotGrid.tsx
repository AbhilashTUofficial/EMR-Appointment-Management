import { memo } from "react";
import type { TimeRange } from "../api/doctors";
import type { DaySlots, Slot } from "../api/slots";

const slotStyles: Record<Slot["status"], string> = {
  AVAILABLE: "border-green-300 bg-green-50 text-green-800",
  BOOKED: "border-blue-200 bg-blue-100 text-blue-800",
  PAST: "border-gray-200 bg-gray-100 text-gray-400",
};
const slotLabels: Record<Slot["status"], string> = { AVAILABLE: "Available", BOOKED: "Booked", PAST: "Past" };

type SlotButtonProps = { slot: Slot; onSelect?: (slot: Slot) => void };

// Memoized so a refetch only re-renders the slots whose data actually changed.
const SlotButton = memo(function SlotButton({ slot, onSelect }: SlotButtonProps) {
  const selectable = slot.status === "AVAILABLE" && !!onSelect;
  return (
    <button
      type="button"
      disabled={!selectable}
      onClick={() => onSelect?.(slot)}
      aria-label={`${slot.start} ${slotLabels[slot.status]}`}
      className={`rounded-md border px-2 py-2 text-sm font-medium ${slotStyles[slot.status]} ${selectable ? "hover:border-green-500 hover:bg-green-100" : "cursor-default"}`}
    >
      {slot.start}
    </button>
  );
});

type Props = { data: DaySlots; onSelect?: (slot: Slot) => void };

// Sessions and breaks in time order, so a lunch break shows up between the morning and evening sessions.
export function SlotGrid({ data, onSelect }: Props) {
  const blocks = [
    ...data.sessions.map((session) => ({ kind: "session" as const, start: session.start, session })),
    ...data.breaks.map((range) => ({ kind: "break" as const, start: range.start, range })),
  ]
    // A break that starts when a session starts is drawn above that session's slots.
    .sort((a, b) => a.start.localeCompare(b.start) || Number(a.kind === "session") - Number(b.kind === "session"));

  return (
    <div className="space-y-5">
      {blocks.map((block) =>
        block.kind === "session" ? (
          <section key={`s-${block.start}`}>
            <h3 className="mb-2 text-sm font-medium text-gray-700">
              {block.session.name || "Session"} · {block.session.start}–{block.session.end}
            </h3>
            {block.session.slots.length === 0 ? (
              <p className="text-sm text-gray-500">No slots in this session.</p>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-2">
                {block.session.slots.map((slot) => (
                  <SlotButton key={slot.start} slot={slot} onSelect={onSelect} />
                ))}
              </div>
            )}
          </section>
        ) : (
          <BreakStrip key={`b-${block.start}`} range={block.range} />
        ),
      )}
    </div>
  );
}

function BreakStrip({ range }: { range: TimeRange }) {
  return (
    <p className="rounded-md bg-gray-100 px-3 py-1.5 text-center text-sm text-gray-500">
      {range.name || "Break"} · {range.start}–{range.end}
    </p>
  );
}

export function SlotLegend() {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-gray-600">
      {(Object.keys(slotStyles) as Slot["status"][]).map((status) => (
        <li key={status} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-3 rounded border ${slotStyles[status]}`} />
          {slotLabels[status]}
        </li>
      ))}
    </ul>
  );
}
