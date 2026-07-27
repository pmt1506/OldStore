export interface Cookie {
  name: string;
  value: string;
  path: string;
  domain?: string;
  expiresAt?: number;
  httpOnly: boolean;
  secure: boolean;
}

/** Persisted Apple ID session. Never holds the raw password. */
export interface AccountSession {
  email: string;
  appleId: string;
  store: string;
  firstName: string;
  lastName: string;
  passwordToken: string;
  directoryServicesIdentifier: string;
  cookies: Cookie[];
  deviceIdentifier: string;
  pod?: string;
  updatedAt: string;
}

export type AccountSummary = Pick<
  AccountSession,
  "email" | "appleId" | "store" | "firstName" | "lastName" | "updatedAt"
>;

export interface Software {
  trackId: number;
  bundleId: string;
  name: string;
  version: string;
  price: number;
  formattedPrice?: string;
  artistName: string;
  sellerName: string;
  description?: string;
  artworkUrl?: string;
  minimumOsVersion?: string;
  fileSizeBytes?: string;
  releaseDate?: string;
  releaseNotes?: string;
  primaryGenreName?: string;
}

export interface Sinf {
  id: number;
  sinf: string; // base64
}

export interface DownloadOutput {
  downloadURL: string;
  sinfs: Sinf[];
  bundleShortVersionString: string;
  bundleVersion: string;
  iTunesMetadataXml?: string;
}

export interface LibraryEntry {
  id: string;
  trackId: number;
  bundleId: string;
  name: string;
  version: string;
  bundleVersion: string;
  accountEmail: string;
  fileName: string;
  fileSize: number;
  minimumOsVersion?: string;
  artworkUrl?: string;
  downloadedAt: string;
}

export type DownloadJobStatus =
  | "pending"
  | "licensing"
  | "downloading"
  | "injecting"
  | "completed"
  | "failed";

export interface DownloadJob {
  id: string;
  trackId: number;
  accountEmail: string;
  status: DownloadJobStatus;
  progress: number;
  error?: string;
  entry?: LibraryEntry;
  createdAt: string;
}
