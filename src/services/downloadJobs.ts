import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { config, PACKAGES_DIR } from "../config.js";
import { getAccount, upsertAccount } from "./accountStore.js";
import { addEntry, listEntries, removeEntry, safeSegment } from "./library.js";
import { downloadToFile } from "./downloader.js";
import { injectLicense } from "./sinfInjector.js";
import { getDownloadInfo, DownloadError } from "../apple/download.js";
import { purchaseApp } from "../apple/purchase.js";
import { lookupSoftware } from "../apple/lookup.js";
import type { DownloadJob, LibraryEntry } from "../types.js";

const jobs = new Map<string, DownloadJob>();

export function getJob(id: string): DownloadJob | undefined {
  return jobs.get(id);
}

export function startDownloadJob(
  accountEmail: string,
  trackId: number,
  externalVersionId: string | undefined,
  country: string | undefined,
): DownloadJob {
  const job: DownloadJob = {
    id: randomUUID(),
    trackId,
    accountEmail,
    status: "pending",
    progress: 0,
    createdAt: new Date().toISOString(),
  };
  jobs.set(job.id, job);
  void run(job, externalVersionId, country);
  return job;
}

async function run(
  job: DownloadJob,
  externalVersionId: string | undefined,
  country: string | undefined,
) {
  try {
    const account = getAccount(job.accountEmail);
    if (!account) throw new Error("Tai khoan chua dang nhap");

    const software = await lookupSoftware(
      { trackId: String(job.trackId), country: country ?? "us" },
      country,
    );
    if (!software) throw new Error("Khong tim thay app tren App Store");

    job.status = "licensing";
    let result;
    try {
      result = await getDownloadInfo(account, job.trackId, externalVersionId);
    } catch (err) {
      if (err instanceof DownloadError && err.code === "9610") {
        if (software.price > 0) {
          throw new Error("App co phi, cong cu nay chi lay license cho app mien phi.");
        }
        const cookiesAfterPurchase = await purchaseApp(account, job.trackId, software.price);
        upsertAccount({ ...account, cookies: cookiesAfterPurchase, updatedAt: new Date().toISOString() });
        result = await getDownloadInfo(
          { ...account, cookies: cookiesAfterPurchase },
          job.trackId,
          externalVersionId,
        );
      } else {
        throw err;
      }
    }

    upsertAccount({
      ...account,
      cookies: result.updatedCookies,
      updatedAt: new Date().toISOString(),
    });

    const { output } = result;
    const bundleId = safeSegment(software.bundleId, "bundleId");
    const fileName = `${safeSegment(output.bundleShortVersionString, "version")}-${safeSegment(output.bundleVersion, "build")}.ipa`;
    const dir = path.join(PACKAGES_DIR, bundleId);
    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, fileName);

    const existing = listEntries().find(
      (e) => e.bundleId === software.bundleId && e.fileName === fileName,
    );
    if (existing) removeEntry(existing.id);

    job.status = "downloading";
    await downloadToFile(output.downloadURL, finalPath, config.maxDownloadMB * 1024 * 1024, (downloaded, total) => {
      job.progress = total > 0 ? Math.round((downloaded / total) * 100) : job.progress;
    });

    job.status = "injecting";
    await injectLicense(output.sinfs, finalPath, output.iTunesMetadataXml);

    const entry: LibraryEntry = {
      id: randomUUID(),
      trackId: job.trackId,
      bundleId: software.bundleId,
      name: software.name,
      version: output.bundleShortVersionString,
      bundleVersion: output.bundleVersion,
      accountEmail: job.accountEmail,
      fileName,
      fileSize: fs.statSync(finalPath).size,
      minimumOsVersion: software.minimumOsVersion,
      artworkUrl: software.artworkUrl,
      downloadedAt: new Date().toISOString(),
    };
    addEntry(entry);

    job.entry = entry;
    job.progress = 100;
    job.status = "completed";
  } catch (err) {
    job.status = "failed";
    job.error = err instanceof Error ? err.message : String(err);
  }
}
