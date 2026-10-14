import { useState } from "react";
import type { Appointment } from "../api/appointments";
import { formatDate } from "../format";
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

// One row of the appointment list, with the actions the viewer's role and the appointment's status allow.
// The server enforces the same rules; this only decides which buttons to offer.
export function AppointmentRow({ appointment: a, isDoctor, departmentName, busy, today, onAction, onEdit }: Props) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const canEdit = isDoctor ? a.status === "ARRIVED" || a.status === "COMPLETED" : a.status === "SCHEDULED" || a.status === "ARRIVED";

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
      <td className="px-3 py-2">
        {confirmingCancel ? (
          <span className="flex items-center gap-2 whitespace-nowrap">
            Cancel this appointment?
            <Button className={small} onClick={() => onAction("cancel", a.id)}>
              Yes, cancel
            </Button>
            <Button variant="secondary" className={small} onClick={() => setConfirmingCancel(false)}>
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
              <Button className={small} disabled={busy} aria-label={`Complete visit for ${a.patient.name}`} onClick={() => onAction("complete", a.id)}>
                Complete
              </Button>
            )}
            {canEdit && (
              <Button variant="secondary" className={small} aria-label={`${isDoctor ? "Notes for" : "Edit"} ${a.patient.name}`} onClick={() => onEdit(a)}>
                {isDoctor ? "Notes" : "Edit"}
              </Button>
            )}
            {!isDoctor && a.status === "SCHEDULED" && (
              <Button variant="secondary" className={small} aria-label={`Cancel appointment for ${a.patient.name}`} onClick={() => setConfirmingCancel(true)}>
                Cancel
              </Button>
            )}
          </span>
        )}
      </td>
    </tr>
  );
}
