import "dotenv/config";
import os from "node:os";
import path from "node:path";

// On Vercel the deployment bundle is read-only outside os.tmpdir(); the
// persistent routes that would use this path are blocked there anyway
// (see middleware/vercelGuard.ts), this just avoids a stray EROFS crash.
const defaultDataDir = process.env.VERCEL === "1" ? path.join(os.tmpdir(), "oldstore-data") : "./data";

export const config = {
  port: parseInt(process.env.PORT ?? "8080", 10),
  dataDir: path.resolve(process.env.DATA_DIR ?? defaultDataDir),
  accessPassword: process.env.ACCESS_PASSWORD ?? "",
  maxDownloadMB: parseInt(process.env.MAX_DOWNLOAD_MB ?? "0", 10) || 0,
};

export const ACCOUNTS_FILE = path.join(config.dataDir, "accounts.json");
export const LIBRARY_FILE = path.join(config.dataDir, "library.json");
export const PACKAGES_DIR = path.join(config.dataDir, "ipas");
