import { mongo } from "mongoose";

// True when MongoDB rejected a write because of a unique index.
export const isDuplicateKeyError = (err: unknown) => err instanceof mongo.MongoServerError && err.code === 11000;

export const escapeRegex = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
