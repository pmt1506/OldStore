import { randomBytes } from "node:crypto";

/**
 * Configurator's User-Agent unlocks the private StoreAPI endpoints (buy,
 * volumeStoreDownloadProduct, auth/v1/native/fast) the public App Store
 * client does not use. Borrowed from ipatool / Asspp.
 */
export const USER_AGENT =
  "Configurator/2.17 (Macintosh; OS X 15.2; 24C5089c) AppleWebKit/0620.1.16.11.6";

export const DEFAULT_AUTH_URL =
  "https://auth.itunes.apple.com/auth/v1/native/fast/";

export function generateDeviceId(): string {
  return randomBytes(6).toString("hex");
}

export function storeAPIHost(pod?: string): string {
  return pod ? `p${pod}-buy.itunes.apple.com` : "p25-buy.itunes.apple.com";
}

export function purchaseAPIHost(pod?: string): string {
  return pod ? `p${pod}-buy.itunes.apple.com` : "buy.itunes.apple.com";
}

// volumeStoreDownloadProduct intermittently answers with failureType 5002.
// The legacy redownload dispatch endpoint serves the same payload as a
// fallback, but names the external version id field differently.
export const RETRYABLE_FAILURE_TYPE = "5002";

export interface StoreDownloadEndpoint {
  host: string;
  path: string;
  externalVersionIdKey: string;
}

export function volumeStoreEndpoint(
  pod: string | undefined,
  deviceId: string,
): StoreDownloadEndpoint {
  return {
    host: storeAPIHost(pod),
    path: `/WebObjects/MZFinance.woa/wa/volumeStoreDownloadProduct?guid=${deviceId}`,
    externalVersionIdKey: "externalVersionId",
  };
}

export function redownloadEndpoint(deviceId: string): StoreDownloadEndpoint {
  return {
    host: "downloaddispatch.itunes.apple.com",
    path: `/r/redownload?guid=${deviceId}`,
    externalVersionIdKey: "appExtVrsId",
  };
}
