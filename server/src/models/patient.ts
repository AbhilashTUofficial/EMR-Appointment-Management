import { Schema, model } from "mongoose";

const patientSchema = new Schema(
  {
    patientCode: { type: String, required: true, unique: true }, // e.g. PT-000042
    name: { type: String, required: true, trim: true },
    nameLower: String, // used for ordering search results
    nameTokens: { type: [String], index: true }, // each word of the name, lowercase, so "das" finds "Rohan Das"
    mobile: { type: String, required: true }, // as entered, e.g. "+91 98765-43210"; not unique, family members share numbers
    mobileDigits: { type: String, index: true }, // digits only: 919876543210
    mobileLocal: { type: String, index: true }, // last 10 digits: 9876543210, so a number can be found without its country code
    gender: { type: String, enum: ["MALE", "FEMALE", "OTHER"], required: true },
    dateOfBirth: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

// Patient names and numbers are not edited after registration; if that changes, these must be updated alongside them.
patientSchema.pre("validate", function () {
  this.nameLower = this.name?.toLowerCase();
  this.nameTokens = this.nameLower?.split(/\s+/).filter(Boolean) ?? [];
  const digits = (this.mobile ?? "").replace(/\D/g, "");
  this.mobileDigits = digits;
  this.mobileLocal = digits.slice(-10);
});

export const Patient = model("Patient", patientSchema);
