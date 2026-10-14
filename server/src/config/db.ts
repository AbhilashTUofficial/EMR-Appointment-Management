import mongoose from "mongoose";
import { env } from "./env";

export function connectDb() {
  return mongoose.connect(env.MONGODB_URI);
}
