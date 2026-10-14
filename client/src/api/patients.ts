import { http } from "./http";

export type Patient = {
  id: string;
  patientCode: string;
  name: string;
  mobile: string;
  gender: "MALE" | "FEMALE" | "OTHER";
  dateOfBirth?: string;
};

export const searchPatients = async (search: string) =>
  (await http<Patient[]>(`/patients?${new URLSearchParams({ search })}`)).data;
