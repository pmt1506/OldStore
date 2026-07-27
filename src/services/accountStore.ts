import fs from "node:fs";
import { ACCOUNTS_FILE, config } from "../config.js";
import type { AccountSession, AccountSummary } from "../types.js";

const accounts = new Map<string, AccountSession>();

function ensureLoaded() {
  if (accounts.size > 0) return;
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (!fs.existsSync(ACCOUNTS_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf-8")) as AccountSession[];
    for (const acc of raw) accounts.set(acc.email, acc);
  } catch {
    // Corrupted file — start fresh rather than crash the server.
  }
}

function persist() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.writeFileSync(
    ACCOUNTS_FILE,
    JSON.stringify(Array.from(accounts.values()), null, 2),
  );
}

export function upsertAccount(session: AccountSession): void {
  ensureLoaded();
  accounts.set(session.email, session);
  persist();
}

export function getAccount(email: string): AccountSession | undefined {
  ensureLoaded();
  return accounts.get(email);
}

export function removeAccount(email: string): boolean {
  ensureLoaded();
  const existed = accounts.delete(email);
  if (existed) persist();
  return existed;
}

export function listAccounts(): AccountSummary[] {
  ensureLoaded();
  return Array.from(accounts.values()).map(
    ({ email, appleId, store, firstName, lastName, updatedAt }) => ({
      email,
      appleId,
      store,
      firstName,
      lastName,
      updatedAt,
    }),
  );
}
