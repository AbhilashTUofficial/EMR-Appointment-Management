import { Department } from "../models/department";

export async function listDepartments() {
  const departments = await Department.find().sort("name").lean();
  return departments.map((d) => ({ id: d._id, name: d.name, code: d.code }));
}
