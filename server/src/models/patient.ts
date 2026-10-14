import { Schema, model } from "mongoose";

const patientSchema = new Schema(
  {
    patientCode: { type: String, required: true, unique: true }, // e.g. PT-000042
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, index: true }, // lets name search use an anchored prefix match on an index
    mobile: { type: String, required: true, index: true }, // not unique: family members share numbers
    gender: { type: String, enum: ["MALE", "FEMALE", "OTHER"], required: true },
    dateOfBirth: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

patientSchema.pre("validate", function () {
  this.nameLower = this.name?.toLowerCase();
});

export const Patient = model("Patient", patientSchema);
