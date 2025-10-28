const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mongoose = require("mongoose");
dotenv.config(); // harmless locally; on Vercel use Dashboard envs

const app = express();

// CORS
const allowedOrigins = (process.env.CORS_ORIGIN || "*")
  .split(",")
  .map(s => s.trim());
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

  mongoReady = mongoose.connect(process.env.MONGO_URI, {
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
app.use("/api/stats", async (req, res, next) => {
  try {
    await connectMongo();
    next();
  } catch (e) {
    res.status(500).json({ error: "Database connection failed" });
  }
}, statsRoute);

// Health
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, env: process.env.VERCEL ? "vercel" : "local" });
});

app.get("/", (req, res) => {
  res.json({ message: "Welcome to the API" });
})

// Export for Vercel
module.exports = app;

// Local dev only
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}
