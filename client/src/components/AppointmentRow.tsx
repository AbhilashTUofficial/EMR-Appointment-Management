import { useState } from "react";
import type { Appointment } from "../api/appointments";
import { age, formatDate } from "../format";
import { Button } from "./Button";
import { StatusBadge } from "./StatusBadge";

type Action = "arrive" | "cancel" | "complete";

type Props = {
  appointment: Appointment;
  isDoctor: boolean;
  departmentName: string;
  busy: boolean;
  today?: string; // the clinic's date, from the server
  onAction: (action: Action, id: string) => void;
  onEdit: (appointment: Appointment) => void;
};

const small = "px-2 py-1 text-xs";
const gender = { MALE: "Male", FEMALE: "Female", OTHER: "Other" };

// One row of the appointment list, with the actions the viewer's role and the appointment's status allow.
// The server enforces the same rules; this only decides which buttons to offer.
export function AppointmentRow({ appointment: a, isDoctor, departmentName, busy, today, onAction, onEdit }: Props) {
  // Cancelling and completing can't be undone, so they ask first.
  const [confirming, setConfirming] = useState<"cancel" | "complete" | null>(null);
  const canEdit = isDoctor ? a.status === "ARRIVED" || a.status === "COMPLETED" : a.status === "SCHEDULED" || a.status === "ARRIVED";
  const years = age(a.patient.dateOfBirth);

  const confirm = (action: "cancel" | "complete") => {
    setConfirming(null);
    onAction(action, a.id);
  };

  return (
    <tr className="align-top">
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
        <br />
        <span className="text-gray-500">
          {gender[a.patient.gender]}
          {years !== undefined && `, ${years} yrs`}
        </span>
      </td>
      {!isDoctor && (
        <td className="px-3 py-2">
          {a.doctor.name}
          <br />
          <span className="text-gray-500">{departmentName}</span>
        </td>
      )}
      <td className="px-3 py-2">{a.purpose}</td>
      <td className="px-3 py-2">
        <StatusBadge status={a.status} />
      </td>
      {/* Stays in view when the table scrolls sideways on a narrow screen. */}
      <td className="sticky right-0 bg-white px-3 py-2 shadow-[-6px_0_6px_-6px_rgba(0,0,0,0.2)]">
        {confirming ? (
          <span className="flex flex-wrap items-center gap-2">
            {confirming === "cancel" ? "Cancel appointment?" : "Mark visit complete?"}
            <Button variant={confirming === "cancel" ? "danger" : "primary"} className={small} onClick={() => confirm(confirming)}>
              {confirming === "cancel" ? "Yes, cancel" : "Yes, complete"}
            </Button>
            <Button variant="secondary" className={small} onClick={() => setConfirming(null)}>
              Keep
            </Button>
          </span>
        ) : (
          <span className="flex flex-wrap gap-2">
            {!isDoctor && a.status === "SCHEDULED" && a.date === today && (
              <Button className={small} disabled={busy} aria-label={`Mark ${a.patient.name} as arrived`} onClick={() => onAction("arrive", a.id)}>
                Mark arrived
              </Button>
            )}
            {isDoctor && a.status === "ARRIVED" && (
              <Button className={small} disabled={busy} aria-label={`Complete visit for ${a.patient.name}`} onClick={() => setConfirming("complete")}>
                Complete
              </Button>
            )}
            {canEdit && (
              <Button variant="secondary" className={small} aria-label={`${isDoctor ? "Notes for" : "Edit"} ${a.patient.name}`} onClick={() => onEdit(a)}>
                {isDoctor ? "Notes" : "Edit"}
              </Button>
            )}
            {!isDoctor && a.status === "SCHEDULED" && (
              <Button variant="secondary" className={small} aria-label={`Cancel appointment for ${a.patient.name}`} onClick={() => setConfirming("cancel")}>
                Cancel
              </Button>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}
