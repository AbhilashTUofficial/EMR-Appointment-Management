import { createServer } from "node:http";
import { app } from "./app";
import { env } from "./config/env";
import { connectDb } from "./config/db";
import mongoose from "mongoose";
import { initRealtime } from "./realtime";

async function main() {
  await connectDb();
  console.log("MongoDB connected");

  // Socket.IO shares the HTTP server with the API.
  const server = createServer(app);
  const realtime = initRealtime(server);

  server.once("error", (err) => {
    console.error(err); // e.g. the port is already in use
    process.exit(1);
  });
  server.listen(env.PORT, () => console.log(`Server listening on port ${env.PORT}`));

  // On a stop signal (docker stop, a deploy): finish in-flight requests, then close the database.
  const shutdown = () => {
    realtime.close(() => mongoose.disconnect().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref(); // don't hang on a stuck connection
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
