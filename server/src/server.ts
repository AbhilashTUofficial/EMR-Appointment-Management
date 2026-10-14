import { createServer } from "node:http";
import { app } from "./app";
import { env } from "./config/env";
import { connectDb } from "./config/db";
import { initRealtime } from "./realtime";

async function main() {
  await connectDb();
  console.log("MongoDB connected");

  // Socket.IO shares the HTTP server with the API.
  const server = createServer(app);
  initRealtime(server);

  server.once("error", (err) => {
    console.error(err); // e.g. the port is already in use
    process.exit(1);
  });
  server.listen(env.PORT, () => console.log(`Server listening on port ${env.PORT}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
