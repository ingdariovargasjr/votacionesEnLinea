import express from "express";
import cors from "cors";
import helmet from "helmet";
import { config } from "./config.js";
import { accountRouter } from "./routes/account.js";
import { eventsRouter } from "./routes/events.js";
import { socialProgramsRouter } from "./routes/social-programs.js";
import { votingsRouter } from "./routes/votings.js";
import { nomineeImagesRouter } from "./routes/nominee-images.js";
import { publicVotingsRouter } from "./routes/public-votings.js";
import { embedRouter } from "./routes/embed.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.has(origin)) return callback(null, true);
    return callback(new Error("Origin not allowed"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Embedder-Origin", "X-Embedder-Token", "X-Participant-Token"],
}));
app.use(express.json({ limit: "32kb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/v1", accountRouter);
app.use("/api/v1/social-programs", socialProgramsRouter);
app.use("/api/v1", votingsRouter);
app.use("/api/v1/nominees", nomineeImagesRouter);
app.use("/api/v1/public", publicVotingsRouter);
app.use("/api/v1/embed", embedRouter);
app.use("/api/v1/events", eventsRouter);
app.use((_req, res) => res.status(404).json({ error: { code: "not_found", message: "Ruta no encontrada." } }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError) return res.status(400).json({ error: { code: "invalid_json", message: "El cuerpo JSON no es válido." } });
  if (typeof error === "object" && error !== null && "status" in error && error.status === 413) {
    return res.status(413).json({ error: { code: "image_too_large", message: "La imagen debe pesar 5 MB o menos." } });
  }
  console.error("Unhandled API error", error);
  return res.status(500).json({ error: { code: "internal_error", message: "Ocurrió un error inesperado." } });
});
