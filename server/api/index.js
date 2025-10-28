const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

// ✅ Only load .env when NOT running on Vercel (local/dev)
if (!process.env.VERCEL) {
  try {
    require("dotenv").config(); // optionally: { path: require("path").join(__dirname, "../.env") }
  } catch (e) {
    console.warn("dotenv not loaded (local only).", e?.message || e);
  }
}

const app = express();

// CORS (supports comma-separated list or "*")
const rawOrigins = process.env.CORS_ORIGIN || "*";
const allowedOrigins = rawOrigins.split(",").map(s => s.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

// ---- Mongo connection (serverless-safe re-use) ----
let mongoReady = global._mongoReady;
async function connectMongo() {
  if (mongoReady) return mongoReady;

  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGO_URI is not set. Add it in Vercel → Settings → Environment Variables.");
  }

  mongoReady = mongoose
    .connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    })
    .then(() => mongoose.connection)
    .catch((err) => {
      console.error("MongoDB connection error:", err);
      throw err;
    });

  global._mongoReady = mongoReady;
  return mongoReady;
}

// Routes
const statsRoute = require("../routes/statsRoute");
app.use(
  "/api/stats",
  async (_req, res, next) => {
    try {
      await connectMongo();
      next();
    } catch (_e) {
      res.status(500).json({ error: "Database connection failed" });
    }
  },
  statsRoute
);

// Health
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    env: process.env.VERCEL ? "vercel" : "local",
  });
});

app.get("/", (_req, res) => {
  res.json({ message: "Welcome to the API" });
});

// Export for Vercel (serverless)
module.exports = app;

// Local dev only
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}
