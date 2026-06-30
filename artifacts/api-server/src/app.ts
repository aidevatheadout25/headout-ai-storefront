import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { authMiddleware } from "./middlewares/authMiddleware";
import { logger } from "./lib/logger";

const app: Express = express();

// The app runs behind the Replit platform proxy, which appends the real client
// IP to x-forwarded-for. Trust a bounded number of proxy hops (default 1) so
// req.ip reflects the address the trusted proxy saw — and so a client cannot
// spoof its identity (e.g. to evade rate limiting) by injecting its own
// x-forwarded-for header. Override TRUST_PROXY_HOPS if more hops are added.
const trustProxyHops = Number(process.env["TRUST_PROXY_HOPS"] ?? "1");
app.set("trust proxy", Number.isFinite(trustProxyHops) ? trustProxyHops : 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

export default app;
