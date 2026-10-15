import { Link } from "react-router";
import type { Status } from "../api/appointments";
import { useAuth } from "../auth/AuthContext";
import { ErrorAlert } from "../components/ErrorAlert";
import { Spinner } from "../components/Spinner";
import { StatusBadge, statusLabels } from "../components/StatusBadge";
import { useAppointments, useSummary } from "../hooks/queries";

const statuses = Object.keys(statusLabels) as Status[];

export default function Dashboard() {
  const { user } = useAuth();
  const summary = useSummary();
  const date = summary.data?.date;
  // Today's appointments in time order, once we know what "today" is on the clinic's clock.
  const today = useAppointments(`from=${date}&to=${date}&sortBy=date&order=asc&limit=10`, !!date);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Welcome, {user?.name}</h1>
          <p className="text-sm text-gray-600">{user?.role === "DOCTOR" ? "Your patients today" : "Today at the clinic"}</p>
        </div>
        {user?.role !== "DOCTOR" && (
          <Link to="/scheduler" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Book an appointment
          </Link>
        )}
      </div>

      {summary.isPending && <Spinner className="py-10" />}
      {summary.isError && <ErrorAlert>{summary.error.message}</ErrorAlert>}

      {summary.data && (
        <>
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {statuses.map((status) => (
              <li key={status}>
                <Link
                  to={`/appointments?${new URLSearchParams({ status, from: summary.data.date, to: summary.data.date })}`}
                  className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300"
                >
                  <p className="text-3xl font-semibold">{summary.data.counts[status]}</p>
                  <StatusBadge status={status} />
                </Link>
              </li>
            ))}
          </ul>

          {summary.data.totals && (
            <p className="text-sm text-gray-600">
              {summary.data.totals.doctors} active doctors · {summary.data.totals.patients} registered patients
            </p>
          )}

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Today's appointments</h2>
              <Link to={`/appointments?from=${date}&to=${date}`} className="text-sm text-blue-700 hover:underline">
                View all
              </Link>
            </div>
            {today.data?.items.length === 0 && <p className="text-sm text-gray-600">Nothing scheduled for today.</p>}
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white empty:hidden">
              {today.data?.items.map((a) => (
                <li key={a.id}>
                  <Link
                    to={`/appointments?${new URLSearchParams({ patient: a.patient.patientCode, from: a.date, to: a.date })}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm hover:bg-gray-50"
                  >
                    <span>
                      <span className="font-medium">{a.slotStart}</span> · {a.patient.name} · <span className="text-gray-500">{a.purpose}</span>
                    </span>
                    <span className="flex items-center gap-3">
                      {user?.role !== "DOCTOR" && <span className="text-gray-500">{a.doctor.name}</span>}
                      <StatusBadge status={a.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
