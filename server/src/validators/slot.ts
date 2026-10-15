import { z } from "zod";
import { isoDate, objectId } from "./common";

export const slotQuerySchema = z.object({
  doctorId: objectId,
  date: isoDate, // YYYY-MM-DD, rejects dates like 2026-13-45
});

export type SlotQuery = z.infer<typeof slotQuerySchema>;
