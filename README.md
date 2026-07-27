# OldStore

*English | [Tiếng Việt](README.vi.md)*

A personal tool: paste an App Store link → look up the **bundle ID**, sign in with an Apple ID to **acquire a license** (a $0 "purchase" for free apps), download the **IPA** and archive it — including **older builds**, so you can install on low-end iOS devices that can no longer receive the latest App Store release.

This is a scaled-down rewrite based on analyzing the architecture of [AssppWeb](https://github.com/Lakr233/AssppWeb) (itself built on [ipatool](https://github.com/majd/ipatool) and [Asspp](https://github.com/Lakr233/Asspp)) — dropping the "zero-trust" WASM/Wisp relay (only needed when publicly hosting for mutually-untrusted users), the `itms-services://` install feature, and multi-threaded chunked/resumable downloads. The goal here is narrower: **look up a bundle ID + acquire a license + download & store the IPA**, for a single person self-hosting on their own machine/server.

## How it works (technical)

Apple has a private "StoreAPI" that Apple Configurator / old iTunes used to sync apps to devices:

1. **Bag** (`init.itunes.apple.com/bag.xml`) — returns the current set of endpoints (auth URL, etc.).
2. **Auth** (`auth.itunes.apple.com/auth/v1/native/fast/`) — signs in with Apple ID + password (plist request), returns a `passwordToken` + DSID. If the account has 2FA enabled, Apple answers with a special error asking for the 6-digit code, which is resent appended to the password.
3. **Buy** (`buy.itunes.apple.com/.../buyProduct`) — "purchases" the app for $0. This is the **license acquisition** step: skip it and the download step gets rejected by Apple with `failureType 9610` (no license) for any app the account hasn't already owned.
4. **Download** (`p25-buy.itunes.apple.com/.../volumeStoreDownloadProduct`) — returns a signed CDN URL (`*.apple.com`) for the `.ipa` file, plus **SINF** blocks (FairPlay license signatures) and version metadata. Pass an `externalVersionId` to fetch an **older build** — this is the mechanism for targeting low-end iOS devices, since the public App Store only ever serves the newest build (which usually requires a higher iOS version).
5. The `.ipa` downloaded from the CDN has **no license baked in** — the server opens the zip and injects the SINF block(s) + an `iTunesMetadata.plist` at the right paths (`SC_Info/...`), then saves it. The IPA is still FairPlay-encrypted exactly as before (nothing here strips DRM); the SINF is just the "license" proving the signed-in Apple ID is entitled to the app.

Bundle ID lookup itself uses the public `itunes.apple.com/lookup` API — no sign-in required.

## Two ways to run it: Docker (full) or Vercel (limited)

The app has two modes, auto-detected from the `VERCEL` environment variable that Vercel sets automatically:

| | **Self-hosted (Docker / `npm start`)** | **Vercel (serverless)** |
| --- | --- | --- |
| Bundle ID lookup | ✅ | ✅ |
| Persistent login (multiple accounts) | ✅ | ❌ |
| License acquisition | ✅ | ✅ (one request does login + license, nothing persisted) |
| Browse/pick an older build | ✅ | ❌ |
| Download & store IPA files | ✅ | ❌ |

**Why Vercel can't download/store IPAs:** a Vercel serverless function (a) has no persistent disk — each invocation may run in a different container, and anything written to `/tmp` disappears right after the request; (b) has a hard **~4.5MB** response-size cap per function, while IPAs typically run 50MB–2GB. This is a platform limit, not a gap in the code — so rather than pretending it works and failing with a confusing error, the routes `/api/accounts`, `/api/license`, `/api/versions`, `/api/downloads`, `/api/library` return a plain `501` when running on Vercel, and the frontend hides the corresponding UI and shows an explanatory banner instead.

`POST /api/quick-license` is the exception: it combines sign-in + `buyProduct` (license acquisition) into a **single request**, with nothing persisted between calls — so it works fine on Vercel to quickly confirm whether an account can get a license for a given app, without self-hosting.

### Deploy to Vercel

1. Fork/import this repo into Vercel (New Project → select the repo).
2. No extra config needed — `vercel.json` already routes every `/api/*` request to the serverless function at `api/index.ts`, and the static frontend in `public/` is served directly by Vercel.
3. (Optional) set `ACCESS_PASSWORD` under Project Settings → Environment Variables if you don't want it open to anyone who finds the URL.
4. Once deployed, open the Vercel-assigned domain — you'll see a "Vercel mode (limited)" banner, with only Lookup + Get License available.

### Self-host with Docker (full features)

```bash
git clone https://github.com/pmt1506/OldStore.git
cd OldStore
cp .env.example .env   # adjust ACCESS_PASSWORD, PORT, etc. if needed
docker compose up -d
```

Listens on `:8080` by default. Data (logged-in accounts + the IPA library) lives in `./data` (mounted as a volume, survives container restarts/rebuilds).

To build/run without compose:

```bash
docker build -t oldstore .
docker run -d -p 8080:8080 -v $(pwd)/data:/app/data --env-file .env oldstore
```

### Self-host without Docker

Requires Node.js >= 20.

```bash
npm install
cp .env.example .env
npm run dev      # development, auto-reload
# or production:
npm run build && npm run start:dist
```

Open `http://localhost:8080`.

## Usage (full mode)

1. **Sign in with an Apple ID** in section 1 (password and 2FA code only ever go to Apple directly; the server keeps only the resulting `passwordToken` + session cookies — never the password itself).
2. **Paste an App Store link** (or a bundle ID / trackId) in section 2 → hit Lookup to see the bundle ID, version, and `minimumOsVersion`.
3. Click **"View older versions"** if you want to pick an older build (to match a low-end iOS device) before downloading.
4. Click **"Get license"** (acquires ownership only, no download) or **"Get license & download IPA"** (does both, with a progress bar).
5. The finished file shows up in **3. IPA Library** — download or delete it there. The file itself lives at `data/ipas/<bundleId>/<version>-<build>.ipa`.

## Usage (Vercel mode)

Paste an App Store link to look it up, then enter the Apple ID / password / (2FA code if prompted) right in the "Get license" form — everything runs in one request, nothing is stored. To actually download the IPA file, switch to self-hosting with Docker.

### Important limitations

- **Free apps only** (`price === 0`). Paid apps are blocked at the license step — this tool never performs a real payment.
- Apple does **not** publish `minimumOsVersion` for individual older builds — only for the current one. When picking an older build, you need to already know (or test) which one is compatible with your device.
- The Apple ID must be able to "own" the app on the corresponding storefront — some apps are only available in certain countries' stores.

## Structure

```
src/
  apple/         StoreAPI protocol: auth, purchase (license), download, lookup, plist, cookies
  services/       accountStore (accounts), library (IPA index), sinfInjector (bakes the license into the ipa),
                  downloader, downloadJobs (orchestrates license -> download -> inject)
  middleware/     accessAuth (access password), vercelGuard (blocks routes that can't run on Vercel)
  routes/         REST API (Express), including quickLicense.ts for the one-request Vercel flow
  app.ts          Builds the Express app (shared by server.ts and api/index.ts)
  server.ts       Entrypoint for self-host/Docker (calls app.listen)
api/index.ts      Entrypoint for Vercel (serverless, never calls listen)
public/           Plain HTML/CSS/JS frontend (no build step)
data/             accounts.json, library.json, ipas/ (gitignored, created at runtime when self-hosted)
```

## Environment variables (`.env`)

| Variable          | Default    | Meaning                                                               |
| ----------------- | ---------- | ---------------------------------------------------------------------- |
| `PORT`             | `8080`     | Listen port (self-host)                                                |
| `DATA_DIR`         | `./data`   | Where logged-in accounts + the IPA library are stored (self-host)      |
| `ACCESS_PASSWORD`  | *(empty)*  | If set, every `/api/*` request must include an `X-Access-Password` header |
| `MAX_DOWNLOAD_MB`  | `0`        | Reject downloads larger than this (MB). `0` = no limit                 |

`VERCEL` is not something you set yourself — Vercel sets it automatically at build/run time, and the app uses it to switch into limited mode.

## Safety / legal notes

- This is a **personal** tool. If you self-host it and expose it beyond localhost, you **must** set `ACCESS_PASSWORD` and put it behind an HTTPS reverse proxy, since the server handles Apple ID passwords (even though it never persists them) and keeps sign-in tokens in `data/accounts.json`.
- Nothing here breaks DRM/FairPlay — the downloaded IPA only works with the license (SINF) injected into it, tied to the Apple ID you signed in with, exactly like iTunes/Apple Configurator used to work.
- Using this private API to re-download an app you've already "purchased" (even for free) happens outside the official App Store flow and may violate Apple's Terms of Service, even though it doesn't infringe copyright in any ordinary sense — use it for personal purposes (backups, installing on your own older device) and at your own risk.
