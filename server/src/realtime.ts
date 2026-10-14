import type { Server as HttpServer } from "node:http";
import type { Types } from "mongoose";
import { Server } from "socket.io";
import { env } from "./config/env";
import type { AppointmentDoc } from "./models/appointment";
import { verifyAccessToken } from "./utils/jwt";

export type AppointmentEvent = "appointment:created" | "appointment:updated" | "appointment:cancelled";

let io: Server | undefined;

export function initRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: env.CLIENT_ORIGIN, credentials: true } });

  // Same access token, checked by the same code, as the API. It is checked once, when the connection is made.
  io.use((socket, next) => {
    try {
      socket.data.user = verifyAccessToken(socket.handshake.auth.token);
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  // Staff see every change; a doctor only their own.
  io.on("connection", (socket) => {
    const { id, role } = socket.data.user;
    socket.join(role === "DOCTOR" ? `doctor:${id}` : "staff");
  });

  return io;
}

type Changed = Pick<AppointmentDoc, "date" | "slotStart" | "status"> & { _id: Types.ObjectId; doctorId: Types.ObjectId };

// Tells connected users that an appointment changed. The message carries only what is needed to decide
// what to refetch (never patient details); clients ask the API for the data, which checks permissions.
export function publish(event: AppointmentEvent, appointment: Changed) {
  io?.to("staff")
    .to(`doctor:${appointment.doctorId}`)
    .emit(event, {
      id: String(appointment._id),
      doctorId: String(appointment.doctorId),
      date: appointment.date,
      slotStart: appointment.slotStart,
      status: appointment.status,
    });
}

// A doctor's schedule changed, which changes the slots open scheduler screens should show.
export function publishScheduleChange(doctorId: Types.ObjectId) {
  io?.to("staff").to(`doctor:${doctorId}`).emit("schedule:updated", { doctorId: String(doctorId) });
}
