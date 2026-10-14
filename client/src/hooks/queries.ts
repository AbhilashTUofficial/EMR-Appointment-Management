import { useQuery } from "@tanstack/react-query";
import { getDepartments } from "../api/departments";
import { getDoctors } from "../api/doctors";
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
