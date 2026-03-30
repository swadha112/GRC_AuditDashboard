import express from "express";
import dotenv from "dotenv";
import cors from "cors";

import gapsRoute from "./routes/gapsRoute.js";
import soaRoute from "./routes/soaRoute.js";
import docsRoute from "./routes/docRoute.js";
import auditGapRoute from "./routes/auditGapRoute.js";
import soaLiteRoute from "./routes/soaLiteRoute.js";
import soaRecordRoute from "./routes/soaRecordRoute.js";

dotenv.config();

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173", // Vite dev
  "http://localhost:8000", // Docker Nginx
];

// Optional override: comma-separated list
// FRONTEND_ORIGINS=http://localhost:8080,http://localhost:5173
const envOrigins = (process.env.FRONTEND_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = envOrigins.length ? envOrigins : DEFAULT_ALLOWED_ORIGINS;

app.use(
  cors({
    origin: (origin, cb) => {
      // allow same-origin / curl / server-to-server (no Origin header)
      if (!origin) return cb(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  })
);

app.use((err, req, res, next) => {
  if (err && String(err.message || "").startsWith("CORS blocked")) {
    return res.status(403).json({ error: err.message });
  }
  return next(err);
});

app.use(express.json());

// Optional: catch unexpected crashes and show error
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

// Mount routes
app.use("/api/gaps", gapsRoute);
app.use("/api/soa", soaRoute);
app.use("/api/docs", docsRoute);
app.use("/api/audit", auditGapRoute);
app.use("/api/soa-lite", soaLiteRoute);
app.use("/api/soa-records", soaRecordRoute);
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
