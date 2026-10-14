import { Schema, model } from "mongoose";

// Atomic sequence numbers, e.g. { _id: "patient", seq: 42 } for patient codes.
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });

export const Counter = model("Counter", counterSchema);
