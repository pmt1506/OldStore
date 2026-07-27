import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./app.js";
import { config } from "./config.js";

// Self-host/Docker only — Vercel serves public/ natively at the edge and
// never reaches this file, so import.meta usage here is safe.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(__dirname, "..", "public")));

const server = app.listen(config.port, () => {
  console.log(`OldStore dang chay tai http://localhost:${config.port}`);
});

// IPA downloads can legitimately take minutes on a slow connection.
server.requestTimeout = 30 * 60 * 1000;
server.headersTimeout = 30 * 60 * 1000 + 5000;
