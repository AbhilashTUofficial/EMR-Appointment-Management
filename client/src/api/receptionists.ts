import { http } from "./http";

export const createReceptionist = async (receptionist: { name: string; email: string; password: string }) =>
  (await http("/receptionists", { method: "POST", body: JSON.stringify(receptionist) })).data;
