import type { Status } from "../api/appointments";

export const statusLabels: Record<Status, string> = {
  SCHEDULED: "Scheduled",
  ARRIVED: "Arrived",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const styles: Record<Status, string> = {
  SCHEDULED: "bg-blue-100 text-blue-800",
  ARRIVED: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>{statusLabels[status]}</span>;
}
