import { Schema, model } from "mongoose";

const departmentSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
});

export const Department = model("Department", departmentSchema);
