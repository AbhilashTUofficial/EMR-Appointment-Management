import { z } from "zod";

export const objectId = z
  .string()
  .regex(/^[0-9a-f]{24}$/i, "Invalid id")
  .transform((id) => id.toLowerCase()); // ids are compared as text, so one spelling only

export const idParams = z.object({ id: objectId });

// z.iso.date() accepts 0001-01-01 and 9999-12-31; keep dates within a range a clinic could mean.
export const isoDate = z.iso.date().refine((date) => date >= "1900-01-01" && date <= "2200-12-31", "Date is out of range");
