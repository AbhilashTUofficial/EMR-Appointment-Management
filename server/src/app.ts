import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { routes } from "./routes";
import { errorHandler, notFound } from "./middlewares/errorHandler";

export const app = express();
app.set("trust proxy", env.TRUST_PROXY);

app.use(helmet());
app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true }));
// Logs the path without its query string, which can carry patient names and numbers.
morgan.token("path", (req) => (req as express.Request).originalUrl.split("?")[0]);
if (env.NODE_ENV !== "test") app.use(morgan(":method :path :status :response-time ms"));
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1", routes);

app.use(notFound);
app.use(errorHandler);
