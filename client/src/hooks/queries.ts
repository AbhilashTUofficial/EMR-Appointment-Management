import { useQuery } from "@tanstack/react-query";
import { getDepartments } from "../api/departments";
import { getDoctors } from "../api/doctors";

// Departments rarely change, so they are cached for the whole session.
export const useDepartments = () => useQuery({ queryKey: ["departments"], queryFn: getDepartments, staleTime: Infinity });

export const useDoctors = (departmentId?: string) =>
  useQuery({ queryKey: ["doctors", departmentId ?? "all"], queryFn: () => getDoctors(departmentId) });
