import { z } from "zod";

export const createStaffSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(100),
  email: z.email().trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .refine((p) => Buffer.byteLength(p) <= 72, "Password is too long"), // bcrypt ignores anything past 72 bytes
});
