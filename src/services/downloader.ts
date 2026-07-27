import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const ALLOWED_HOST_RE = /\.apple\.com$/i;

/** The signed CDN URL only ever points at Apple's own infrastructure. */
export function validateDownloadURL(rawUrl: string): void {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Download URL phai dung HTTPS");
  if (!ALLOWED_HOST_RE.test(url.hostname)) {
    throw new Error("Download URL phai thuoc mien *.apple.com");
  }
}

export async function downloadToFile(
  url: string,
  destPath: string,
  maxBytes: number,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<void> {
  validateDownloadURL(url);

  const resp = await fetch(url);
  if (!resp.ok || !resp.body) {
    throw new Error(`Tai file that bai: HTTP ${resp.status}`);
  }

  const total = Number(resp.headers.get("content-length") ?? 0);
  if (maxBytes > 0 && total > maxBytes) {
    await resp.body.cancel();
    throw new Error(`File vuot qua gioi han ${Math.round(maxBytes / 1024 / 1024)} MB`);
  }

  let downloaded = 0;
  const source = Readable.fromWeb(resp.body as import("node:stream/web").ReadableStream);
  source.on("data", (chunk: Buffer) => {
    downloaded += chunk.length;
    if (maxBytes > 0 && downloaded > maxBytes) {
      source.destroy(new Error(`File vuot qua gioi han ${Math.round(maxBytes / 1024 / 1024)} MB`));
      return;
    }
    onProgress?.(downloaded, total);
  });

  await pipeline(source, fs.createWriteStream(destPath));
}
