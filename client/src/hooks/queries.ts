import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getSummary, listAppointments } from "../api/appointments";
import { getDepartments } from "../api/departments";
import { getDoctors } from "../api/doctors";
import { searchPatients } from "../api/patients";
import { getSlots } from "../api/slots";

// Departments rarely change, so they are cached for the whole session.
export const useDepartments = () => useQuery({ queryKey: ["departments"], queryFn: getDepartments, staleTime: Infinity });

export const useDoctors = (departmentId?: string) =>
  useQuery({ queryKey: ["doctors", departmentId ?? "all"], queryFn: () => getDoctors(departmentId) });

export const useSlots = (doctorId: string | undefined, date: string) =>
  useQuery({
    queryKey: ["slots", doctorId, date],
    queryFn: () => getSlots(doctorId!, date),
    enabled: !!doctorId && !!date,
  });

export const usePatientSearch = (term: string) =>
  useQuery({ queryKey: ["patients", term], queryFn: () => searchPatients(term), enabled: term.length > 0 });

// `query` is the URL query string, so the page's filters, sorting and page number are the cache key.
// Keeping the previous page on screen while the next one loads avoids a flash of empty content.
export const useAppointments = (query: string, enabled = true) =>
  useQuery({ queryKey: ["appointments", query], queryFn: () => listAppointments(query), placeholderData: keepPreviousData, enabled });

export const useSummary = () => useQuery({ queryKey: ["dashboard"], queryFn: getSummary });
