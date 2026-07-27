import express from "express";
import { accessAuth } from "./middleware/accessAuth.js";
import { blockOnVercel, IS_VERCEL } from "./middleware/vercelGuard.js";
import accountsRouter from "./routes/accounts.js";
import lookupRouter from "./routes/lookup.js";
import licenseRouter from "./routes/license.js";
import quickLicenseRouter from "./routes/quickLicense.js";
import downloadRouter from "./routes/download.js";
import libraryRouter from "./routes/library.js";

// No filesystem/import.meta usage here: Vercel auto-detects this file as
// the app entrypoint (its Node backend framework support looks for
// app/index/server/main under src/, in that order — "src/app" matches
// before "src/server" does) and bundles it directly, with its own module
// format assumptions. Keep it to pure request handling; static file
// serving for self-host is wired up separately in server.ts.
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

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Loi noi bo" });
});

// Vercel's zero-config Node backend detection requires a default export
// (or a call to .listen()) on the entrypoint file it picks.
export default app;
