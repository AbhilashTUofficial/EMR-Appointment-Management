import { Schema, model } from "mongoose";

// Only a hash of the token is stored, so a database leak doesn't expose usable tokens.
// A used token is kept (marked with usedAt) until it expires, so a replayed one can be told apart from an unknown one.
const refreshTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  usedAt: Date,
  expiresAt: { type: Date, required: true, expires: 0 }, // Mongo deletes the document once this date passes
});

export const RefreshToken = model("RefreshToken", refreshTokenSchema);
