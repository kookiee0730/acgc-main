import express from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import process from "node:process";
import authRoutes from "./routes/auth.js";
import productRoutes from "./routes/products.js";
import uploadRoutes from "./routes/uploads.js";
import catalogRoutes from "./routes/catalog.js";
import path from "path";
import { fileURLToPath } from "url";
import orderRoutes from "./routes/orders.js";
import cartRoutes from "./routes/cart.js";
import repairRoutes from "./routes/repairs.js";
import { connectMongo, getLastMongoError, hasMongoUri } from "./config/db.js";
import { startSystemBackupScheduler } from "./services/backupService.js";
import { startSiteInspectionReminderScheduler } from "./services/siteInspectionReminders.js";
import { startPaymentReminderScheduler } from "./services/paymentReminders.js";
import { createRealtimeServer, realtimeResponseMiddleware } from "./services/realtime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
if (process.env.NODE_ENV !== "production" && process.env.VERCEL !== "1") {
  dotenv.config({ path: path.resolve(__dirname, ".env"), quiet: true });
}

const isVerbose = process.env.DEBUG_API === "true" || process.env.VERBOSE === "true";
const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
const requiredEnvs = ["JWT_SECRET"];
for (const envName of requiredEnvs) {
  if (!process.env[envName]) {
    console.error(`Missing required environment variable: ${envName}`);
    process.exit(1);
  }
}

if (!process.env.MONGO_URI && isVerbose) {
  console.warn(
    "[env] MONGO_URI not set. The backend will attempt to connect to local MongoDB at mongodb://127.0.0.1:27017/reactvite"
  );
}

const app = express();
const httpServer = createServer(app);
const realtimeServer = createRealtimeServer(httpServer);
app.set("realtime", realtimeServer);
const PORT = parseInt(process.env.PORT, 10) || 5000;

if (isVerbose) {
  app.use((req, res, next) => {
    console.info(`[api] ${req.method} ${req.originalUrl}`);
    next();
  });
}

app.use(
  cors({
    origin: true,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Client-Id"],
  })
);
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(async (req, res, next) => {
  try {
    await connectMongo();
  } catch {
    return next();
  }
  return next();
});

// Serve uploaded files
app.use("/uploads", express.static(path.join(process.cwd(), "uploads"), {
  maxAge: "1d",
  immutable: true,
}));

const getHealthModel = () => {
  const readyStates = [
    "disconnected",
    "connected",
    "connecting",
    "disconnecting",
    "uninitialized",
  ];
  const mongoState = mongoose.connection.readyState;
  const dbConnected = mongoState === 1;
  return {
    status: dbConnected ? "online" : "offline",
    dbConnected,
    hasMongoUri: hasMongoUri(),
    lastConnectionError: getLastMongoError(),
    databaseState: readyStates[mongoState] || "unknown",
    timestamp: new Date().toISOString(),
    message: dbConnected
      ? "Backend and database are connected"
      : "Backend is running but the database is unavailable",
  };
};

app.get("/", (req, res) => {
  return res.json({ ...getHealthModel(), message: "Backend is running" });
});

app.get("/api/health", (req, res) => {
  return res.json(getHealthModel());
});

app.use("/api", (req, res, next) => {
  if (mongoose.connection.readyState === 1) {
    return next();
  }

  return res.status(503).json({
    success: false,
    message:
      "Backend is running, but MongoDB is not connected yet. Start MongoDB and try again.",
    health: getHealthModel(),
  });
});

app.use("/api", realtimeResponseMiddleware(realtimeServer));

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/repairs", repairRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/catalog", catalogRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  void next;
  if (err.name === "MulterError") {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File size exceeds 5MB limit"
        : "Invalid file type: only JPEG, PNG, WEBP, and GIF are allowed";
    return res.status(400).json({ success: false, message });
  }

  console.error("[error]", err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Internal server error",
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
});

const shutdown = (reason, error) => {
  console.error(`Shutdown: ${reason}`);
  if (error) {
    console.error(error);
  }
  process.exit(1);
};

const connectWithRetry = async (attempt = 1) => {
  if (mongoose.connection.readyState === 1 || mongoose.connection.readyState === 2) {
    return;
  }

  try {
    await connectMongo();
    if (process.env.VERCEL !== "1") {
      startSystemBackupScheduler();
      startSiteInspectionReminderScheduler(realtimeServer);
      startPaymentReminderScheduler(realtimeServer);
    }
  } catch {
    const delayMs = Math.min(30000, 2000 * attempt);
    console.error(`MongoDB connection retry in ${Math.round(delayMs / 1000)}s.`);
    setTimeout(() => connectWithRetry(attempt + 1), delayMs);
  }
};

if (process.env.VERCEL !== "1") {
  httpServer.listen(PORT, () => {
    if (isVerbose) {
      console.log(`Server listening on http://localhost:${PORT}`);
      console.log(`API base URL: http://localhost:${PORT}/api`);
    }
    connectWithRetry();
  });
}

process.on("uncaughtException", (error) => {
  shutdown("Uncaught exception", error);
});

process.on("unhandledRejection", (reason) => {
  shutdown("Unhandled promise rejection", reason instanceof Error ? reason : new Error(String(reason)));
});

process.on("SIGINT", () => {
  if (isVerbose) console.log("Received SIGINT, shutting down gracefully.");
  process.exit(0);
});

process.on("SIGTERM", () => {
  if (isVerbose) console.log("Received SIGTERM, shutting down gracefully.");
  process.exit(0);
});

export default app;
