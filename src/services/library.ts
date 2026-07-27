import fs from "node:fs";
import path from "node:path";
import { LIBRARY_FILE, PACKAGES_DIR, config } from "../config.js";
import type { LibraryEntry } from "../types.js";

let entries: LibraryEntry[] = [];
let loaded = false;

const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

/** Rejects path traversal / empty segments before they touch the filesystem. */
export function safeSegment(value: string, label: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error(`Gia tri khong hop le cho ${label}`);
  }
  return cleaned;
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  fs.mkdirSync(PACKAGES_DIR, { recursive: true });
  if (!fs.existsSync(LIBRARY_FILE)) return;
  try {
    entries = JSON.parse(fs.readFileSync(LIBRARY_FILE, "utf-8")) as LibraryEntry[];
  } catch {
    entries = [];
  }
}

function persist() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(LIBRARY_FILE, JSON.stringify(entries, null, 2));
}

export function listEntries(): LibraryEntry[] {
  ensureLoaded();
  return [...entries].sort((a, b) => b.downloadedAt.localeCompare(a.downloadedAt));
}

export function getEntry(id: string): LibraryEntry | undefined {
  ensureLoaded();
  return entries.find((e) => e.id === id);
}

export function addEntry(entry: LibraryEntry): void {
  ensureLoaded();
  entries = entries.filter((e) => e.id !== entry.id);
  entries.push(entry);
  persist();
}

export function filePathFor(entry: LibraryEntry): string {
  const dir = path.join(PACKAGES_DIR, safeSegment(entry.bundleId, "bundleId"));
  return path.join(dir, entry.fileName);
}

export function removeEntry(id: string): boolean {
  ensureLoaded();
  const entry = entries.find((e) => e.id === id);
  if (!entry) return false;

  const filePath = filePathFor(entry);
  const resolved = path.resolve(filePath);
  const base = path.resolve(PACKAGES_DIR);
  if (resolved.startsWith(base + path.sep) && fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }

  entries = entries.filter((e) => e.id !== id);
  persist();
  return true;
}
