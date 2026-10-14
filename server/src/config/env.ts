import { z } from "zod";

const isTimeZone = (zone: string) => {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
};

const schema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().default(4000),
    CLIENT_ORIGIN: z.string().default("http://localhost:5173"),
    MONGODB_URI: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    // Appointment dates and times are wall-clock times in this zone.
    CLINIC_TIMEZONE: z.string().refine(isTimeZone, "Unknown timezone").default("Asia/Kolkata"),
  })
  // Same secret for both would let an access token pass as a refresh token.
  .refine((e) => e.JWT_ACCESS_SECRET !== e.JWT_REFRESH_SECRET, "JWT secrets must be different");

// Parsed once at boot so a bad config stops the server instead of failing later.
export const env = schema.parse(process.env);
