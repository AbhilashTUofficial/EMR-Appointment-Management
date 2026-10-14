import { z } from "zod";
import { objectId } from "./common";

export const slotQuerySchema = z.object({
  doctorId: objectId,
  date: z.iso.date(), // YYYY-MM-DD, rejects dates like 2026-13-45
});
