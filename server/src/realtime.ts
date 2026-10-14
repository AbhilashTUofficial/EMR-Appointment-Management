import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { env } from "./config/env";
import { ROLES, type Role } from "./models/user";
import { verifyToken } from "./utils/jwt";

export type AppointmentEvent = "appointment:created" | "appointment:updated" | "appointment:cancelled";

let io: Server | undefined;

export function initRealtime(httpServer: HttpServer) {
  io = new Server(httpServer, { cors: { origin: env.CLIENT_ORIGIN, credentials: true } });

  // Same access token as the API. It is checked once, when the connection is made.
  io.use((socket, next) => {
    try {
      const payload = verifyToken(String(socket.handshake.auth.token), env.JWT_ACCESS_SECRET);
      if (!payload.sub || !ROLES.includes(payload.role)) throw new Error("bad token");
      socket.data.user = { id: payload.sub, role: payload.role as Role };
      next();
    } catch {
      next(new Error("UNAUTHORIZED"));
    }
  });

  // Staff see every appointment change; a doctor only their own.
  io.on("connection", (socket) => {
    const { id, role } = socket.data.user;
    socket.join(role === "DOCTOR" ? `doctor:${id}` : "staff");
  });

  return io;
}

type Changed = { _id: unknown; doctorId: unknown; date: string; slotStart: string; status: string };

// Tells connected users that an appointment changed. The message carries only what is needed to decide
// what to refetch (never patient details); clients ask the API for the data, which checks permissions.
export function publish(event: AppointmentEvent, appointment: Changed) {
  io?.to("staff")
    .to(`doctor:${String(appointment.doctorId)}`)
    .emit(event, {
      id: String(appointment._id),
      doctorId: String(appointment.doctorId),
      date: appointment.date,
      slotStart: appointment.slotStart,
      status: appointment.status,
    });
}

export const closeRealtime = () => io?.close();
