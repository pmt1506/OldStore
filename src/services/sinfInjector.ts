import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Readable } from "node:stream";
import * as yauzl from "yauzl";
import * as yazl from "yazl";
import bplistParser from "bplist-parser";
import bplistCreator from "bplist-creator";
import plist from "plist";
import type { Sinf } from "../types.js";

interface IpaShape {
  bundleName: string;
  sinfPaths: string[] | null;
  bundleExecutable: string | null;
}

function openZip(filePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (err, zipfile) => {
      if (err || !zipfile) reject(err ?? new Error("Khong mo duoc IPA"));
      else resolve(zipfile);
    });
  });
}

function streamToBuffer(stream: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function parsePlistBuffer(data: Buffer): Record<string, unknown> | null {
  try {
    const parsed = bplistParser.parseBuffer(data);
    if (parsed?.length) return parsed[0] as Record<string, unknown>;
  } catch {
    // Not a binary plist — fall through to XML.
  }
  try {
    const xml = data.toString("utf-8");
    if (xml.includes("<plist")) {
      const parsed = plist.parse(xml);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    }
  } catch {
    // Not a valid XML plist either.
  }
  return null;
}

async function readIpaShape(ipaPath: string): Promise<IpaShape> {
  const zipfile = await openZip(ipaPath);
  let bundleName: string | null = null;
  let manifestData: Buffer | null = null;
  let infoData: Buffer | null = null;

  await new Promise<void>((resolve, reject) => {
    zipfile.on("error", reject);
    zipfile.on("end", () => resolve());
    zipfile.on("entry", (entry: yauzl.Entry) => {
      const name = entry.fileName;
      const isInfoPlist = name.includes(".app/Info.plist") && !name.includes("/Watch/");
      const isManifest = name.endsWith(".app/SC_Info/Manifest.plist");

      if (!isInfoPlist && !isManifest) {
        zipfile.readEntry();
        return;
      }

      if (!bundleName && isInfoPlist) {
        for (const seg of name.split("/")) {
          if (seg.endsWith(".app")) {
            bundleName = seg.slice(0, -4);
            break;
          }
        }
      }

      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error("Khong doc duoc entry trong IPA"));
          return;
        }
        streamToBuffer(stream)
          .then((buf) => {
            if (isManifest) manifestData = buf;
            if (isInfoPlist) infoData = buf;
            zipfile.readEntry();
          })
          .catch(reject);
      });
    });
    zipfile.readEntry();
  });

  zipfile.close();

  if (!bundleName) throw new Error("Khong xac dinh duoc ten bundle (.app) trong IPA");

  let sinfPaths: string[] | null = null;
  if (manifestData) {
    const parsed = parsePlistBuffer(manifestData);
    const paths = parsed?.SinfPaths;
    if (Array.isArray(paths)) sinfPaths = paths as string[];
  }

  let bundleExecutable: string | null = null;
  if (infoData) {
    const parsed = parsePlistBuffer(infoData);
    if (typeof parsed?.CFBundleExecutable === "string") {
      bundleExecutable = parsed.CFBundleExecutable;
    }
  }

  return { bundleName, sinfPaths, bundleExecutable };
}

/**
 * Bakes the license (SINF) blobs Apple handed back in the download response
 * into the IPA, plus an iTunesMetadata.plist recording who "owns" it. A raw
 * IPA off Apple's CDN has no license embedded — without this step the app
 * still refuses to run/install as if never purchased.
 *
 * Rewrites the whole archive via yauzl (read) + yazl (write) instead of
 * shelling out to a `zip` binary, so this works the same on Windows/macOS/
 * Linux without extra system dependencies.
 */
export async function injectLicense(
  sinfs: Sinf[],
  ipaPath: string,
  iTunesMetadataXml?: string,
): Promise<void> {
  const shape = await readIpaShape(ipaPath);

  const overrides = new Map<string, Buffer>();
  if (shape.sinfPaths) {
    shape.sinfPaths.forEach((sinfPath, i) => {
      const sinf = sinfs[i];
      if (!sinf) return;
      overrides.set(
        `Payload/${shape.bundleName}.app/${sinfPath}`,
        Buffer.from(sinf.sinf, "base64"),
      );
    });
  } else if (shape.bundleExecutable && sinfs[0]) {
    overrides.set(
      `Payload/${shape.bundleName}.app/SC_Info/${shape.bundleExecutable}.sinf`,
      Buffer.from(sinfs[0].sinf, "base64"),
    );
  } else {
    throw new Error("Khong tim thay Manifest.plist hoac Info.plist de gan SINF");
  }

  const extraFiles = new Map<string, Buffer>();
  if (iTunesMetadataXml) {
    let metadataBuffer: Buffer;
    try {
      metadataBuffer = bplistCreator(plist.parse(iTunesMetadataXml) as Record<string, unknown>);
    } catch {
      metadataBuffer = Buffer.from(iTunesMetadataXml, "utf-8");
    }
    extraFiles.set("iTunesMetadata.plist", metadataBuffer);
  }

  const tmpDest = path.join(
    os.tmpdir(),
    `oldstore-${path.basename(ipaPath)}-${Date.now()}.ipa`,
  );

  await rewriteZip(ipaPath, tmpDest, overrides, extraFiles);

  await fs.promises.rm(ipaPath, { force: true });
  await fs.promises.rename(tmpDest, ipaPath);
}

async function rewriteZip(
  srcPath: string,
  destPath: string,
  overrides: Map<string, Buffer>,
  extraFiles: Map<string, Buffer>,
): Promise<void> {
  const zipfile = await openZip(srcPath);
  const outZip = new yazl.ZipFile();
  const overridden = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    zipfile.on("error", reject);
    zipfile.on("end", () => resolve());
    zipfile.on("entry", (entry: yauzl.Entry) => {
      if (/\/$/.test(entry.fileName)) {
        outZip.addEmptyDirectory(entry.fileName);
        zipfile.readEntry();
        return;
      }

      const override = overrides.get(entry.fileName);
      if (override) {
        outZip.addBuffer(override, entry.fileName);
        overridden.add(entry.fileName);
        zipfile.readEntry();
        return;
      }

      zipfile.openReadStream(entry, (err, stream) => {
        if (err || !stream) {
          reject(err ?? new Error("Khong doc duoc entry trong IPA"));
          return;
        }
        outZip.addReadStream(stream, entry.fileName);
        zipfile.readEntry();
      });
    });
    zipfile.readEntry();
  });

  zipfile.close();

  for (const [entryPath, buf] of overrides) {
    if (!overridden.has(entryPath)) outZip.addBuffer(buf, entryPath);
  }
  for (const [entryPath, buf] of extraFiles) {
    outZip.addBuffer(buf, entryPath);
  }

  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(destPath);
    out.on("close", resolve);
    out.on("error", reject);
    outZip.outputStream.on("error", reject);
    outZip.outputStream.pipe(out);
    outZip.end();
  });
}
