import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { routes } from "./routes";
import { errorHandler, notFound } from "./middlewares/errorHandler";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN }));
if (env.NODE_ENV !== "test") app.use(morgan("dev"));
app.use(express.json());

app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);
