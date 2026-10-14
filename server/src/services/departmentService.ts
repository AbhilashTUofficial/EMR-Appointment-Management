import { Department } from "../models/department";

export const listDepartments = () => Department.find().sort("name").select("name code").lean();
