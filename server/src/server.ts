import { app } from "./app";
import { env } from "./config/env";

// Express 5 passes listen errors (e.g. port in use) to this callback.
app.listen(env.PORT, (err) => {
  if (err) throw err;
  console.log(`Server listening on port ${env.PORT}`);
});
