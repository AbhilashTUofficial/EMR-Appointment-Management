import { app } from "./app";
import { env } from "./config/env";
import { connectDb } from "./config/db";

async function main() {
  await connectDb();
  console.log("MongoDB connected");

  // Express 5 passes listen errors (e.g. port in use) to this callback.
  app.listen(env.PORT, (err) => {
    if (err) throw err;
    console.log(`Server listening on port ${env.PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
