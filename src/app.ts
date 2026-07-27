import express from "express";
import path from "node:path";
import { accessAuth } from "./middleware/accessAuth.js";
import { blockOnVercel, IS_VERCEL } from "./middleware/vercelGuard.js";
import accountsRouter from "./routes/accounts.js";
import lookupRouter from "./routes/lookup.js";
import licenseRouter from "./routes/license.js";
import quickLicenseRouter from "./routes/quickLicense.js";
import downloadRouter from "./routes/download.js";
import libraryRouter from "./routes/library.js";

// Vercel auto-detects this file as the app entrypoint (its Node backend
// support looks for app/index/server/main under src/, in that order) and
// bundles it directly. Deliberately no import.meta.url here — the bundler
// rewrites the module format and that broke the export contract before.
export const app = express();
app.use(express.json({ limit: "1mb" }));

app.use("/api", accessAuth);

app.get("/api/mode", (_req, res) => {
  res.json({ vercel: IS_VERCEL, storage: IS_VERCEL ? "ephemeral" : "full" });
});

// Persistent-session / persistent-storage features are not viable on
// Vercel's serverless model (see middleware/vercelGuard.ts) — block them
// there instead of failing in confusing ways mid-flow.
app.use("/api/accounts", blockOnVercel);
app.use("/api/license", blockOnVercel);
app.use("/api/versions", blockOnVercel);
app.use("/api/downloads", blockOnVercel);
app.use("/api/library", blockOnVercel);

app.use("/api", accountsRouter);
app.use("/api", lookupRouter);
app.use("/api", licenseRouter);
app.use("/api", quickLicenseRouter);
app.use("/api", downloadRouter);
app.use("/api", libraryRouter);

// Serve the frontend from the app itself rather than relying on the host's
// static routing, so "/" behaves identically on Vercel, Docker and local.
// process.cwd() is the project root in all three (Vercel needs the
// includeFiles entry in vercel.json to ship public/ into the bundle).
app.use(express.static(path.join(process.cwd(), "public")));

// Vercel moves public/*.html into its own static hosting, so the middleware
// above can't find index.html there and "/" would fall through to a 404.
// Self-host never reaches this line — express.static already answered.
app.get("/", (_req, res) => {
  res.redirect("/index.html");
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Log the message only, never the error object: express.json() attaches
  // the raw request body to parse failures, which would put a visitor's
  // Apple ID password into the host's logs.
  console.error(err instanceof Error ? err.message : String(err));

  // body-parser tags malformed input with a 4xx status — that's the
  // client's fault, not ours.
  const status = (err as { status?: number })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: "Yeu cau khong hop le" });
    return;
  }
  res.status(500).json({ error: "Loi noi bo" });
});

// Vercel's zero-config Node backend detection requires a default export
// (or a call to .listen()) on the entrypoint file it picks.
export default app;
