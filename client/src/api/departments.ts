import { http } from "./http";

export type Department = { id: string; name: string; code: string };

export const getDepartments = async () => (await http<Department[]>("/departments")).data;
