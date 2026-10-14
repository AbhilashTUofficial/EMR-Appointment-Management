import { Schema, model } from "mongoose";

// Only a hash of the token is stored, so a database leak doesn't expose usable tokens.
const refreshTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 }, // Mongo deletes the document once this date passes
});

export const RefreshToken = model("RefreshToken", refreshTokenSchema);
