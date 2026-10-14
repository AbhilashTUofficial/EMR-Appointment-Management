import { z } from "zod";

export const objectId = z.string().regex(/^[0-9a-f]{24}$/i, "Invalid id");

export const idParams = z.object({ id: objectId });
