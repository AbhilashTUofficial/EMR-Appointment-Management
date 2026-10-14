import mongoose from "mongoose";
import { env } from "./env";

export async function connectDb() {
  await mongoose.connect(env.MONGODB_URI);
  // Wait for index builds (every model imported so far) so the unique slot index exists
  // before the server takes bookings.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
}
