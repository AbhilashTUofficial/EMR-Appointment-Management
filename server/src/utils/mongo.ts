import { mongo } from "mongoose";

// True when MongoDB rejected a write because of a unique index. Pass a field name to only match that index.
export const isDuplicateKeyError = (err: unknown, field?: string) =>
  err instanceof mongo.MongoServerError && err.code === 11000 && (!field || field in (err.keyPattern ?? {}));

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
