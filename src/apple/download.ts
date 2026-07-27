import type { AccountSession, Cookie, DownloadOutput, Sinf } from "../types.js";
import { appleRequest } from "./client.js";
import { buildPlist, parsePlist } from "./plistCodec.js";
import { mergeCookies, parseCookieHeaders } from "./cookies.js";
import {
  RETRYABLE_FAILURE_TYPE,
  redownloadEndpoint,
  volumeStoreEndpoint,
  type StoreDownloadEndpoint,
} from "./constants.js";

export class DownloadError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "DownloadError";
  }
}

interface StoreQueryResult {
  dict: Record<string, unknown>;
  updatedCookies: Cookie[];
}

/** Shared redirect/retry dance used by download, version-list and version-metadata lookups. */
async function queryStore(
  account: AccountSession,
  trackId: number,
  extra: Record<string, unknown>,
): Promise<StoreQueryResult> {
  const deviceId = account.deviceIdentifier;
  let endpoint: StoreDownloadEndpoint = volumeStoreEndpoint(account.pod, deviceId);
  let requestHost = endpoint.host;
  let requestPath = endpoint.path;
  let triedRedownload = false;
  let cookies = [...account.cookies];
  let redirectAttempt = 0;

  while (redirectAttempt <= 3) {
    const payload: Record<string, unknown> = {
      creditDisplay: "",
      guid: deviceId,
      salableAdamId: String(trackId),
      ...extra,
    };

    const response = await appleRequest({
      method: "POST",
      host: requestHost,
      path: requestPath,
      headers: {
        "Content-Type": "application/x-apple-plist",
        "iCloud-DSID": account.directoryServicesIdentifier,
        "X-Dsid": account.directoryServicesIdentifier,
      },
      body: buildPlist(payload),
      cookies,
    });

    cookies = mergeCookies(cookies, parseCookieHeaders(response.setCookies));

    if (response.status === 302) {
      const location = response.headers.get("location");
      if (!location) throw new DownloadError("Redirect thieu Location header");
      const url = new URL(location);
      requestHost = url.hostname;
      requestPath = url.pathname + url.search;
      redirectAttempt++;
      continue;
    }

    const dict = parsePlist(response.body);

    if (
      String(dict.failureType ?? "") === RETRYABLE_FAILURE_TYPE &&
      !triedRedownload
    ) {
      triedRedownload = true;
      endpoint = redownloadEndpoint(deviceId);
      requestHost = endpoint.host;
      requestPath = endpoint.path;
      redirectAttempt = 0;
      continue;
    }

    return { dict, updatedCookies: cookies };
  }

  throw new DownloadError("Qua nhieu redirect khi goi Apple store API");
}

function throwFailure(dict: Record<string, unknown>): never {
  const failureType = String(dict.failureType);
  const customerMessage = dict.customerMessage as string | undefined;
  switch (failureType) {
    case "2034":
    case "2042":
      throw new DownloadError("Phien dang nhap het han, hay dang nhap lai.", failureType);
    case "9610":
      throw new DownloadError("Tai khoan chua co license cho app nay.", "9610");
    default:
      if (customerMessage === "Your password has changed.") {
        throw new DownloadError("Mat khau Apple ID da doi, hay dang nhap lai.", failureType);
      }
      throw new DownloadError(
        customerMessage ?? `Yeu cau Apple that bai (failureType ${failureType})`,
        failureType,
      );
  }
}

/**
 * Resolves the signed CDN URL + FairPlay SINF blobs for a licensed app.
 * Pass `externalVersionId` (from listVersions) to pull an older build —
 * this is the mechanism for targeting devices stuck on an old iOS version,
 * since Apple only lets the *current* build satisfy the App Store's
 * minimum-OS check.
 */
export async function getDownloadInfo(
  account: AccountSession,
  trackId: number,
  externalVersionId?: string,
): Promise<{ output: DownloadOutput; updatedCookies: Cookie[] }> {
  const extra: Record<string, unknown> = externalVersionId
    ? { externalVersionId }
    : {};
  const { dict, updatedCookies } = await queryStore(account, trackId, extra);

  if (dict.failureType) throwFailure(dict);

  const songList = dict.songList as Record<string, unknown>[] | undefined;
  const item = songList?.[0];
  if (!item) throw new DownloadError("Apple khong tra ve item nao (songList rong)");

  const url = item.URL as string | undefined;
  if (!url) throw new DownloadError("Thieu download URL trong phan hoi cua Apple");

  const metadata = item.metadata as Record<string, unknown> | undefined;
  if (!metadata) throw new DownloadError("Thieu metadata trong phan hoi cua Apple");

  const version = metadata.bundleShortVersionString as string | undefined;
  const bundleVersion = metadata.bundleVersion as string | undefined;
  if (!version || !bundleVersion) {
    throw new DownloadError("Thieu thong tin phien ban trong metadata");
  }

  const sinfs: Sinf[] = [];
  const sinfData = item.sinfs as Record<string, unknown>[] | undefined;
  for (const sinfItem of sinfData ?? []) {
    const id = sinfItem.id as number | undefined;
    const sinf = sinfItem.sinf;
    if (id === undefined || !sinf) continue;
    const sinfBase64 =
      sinf instanceof Buffer || sinf instanceof Uint8Array
        ? Buffer.from(sinf).toString("base64")
        : String(sinf);
    sinfs.push({ id, sinf: sinfBase64 });
  }
  if (sinfs.length === 0) throw new DownloadError("Phan hoi cua Apple khong co SINF (license)");

  const metadataDict: Record<string, unknown> = { ...metadata };
  metadataDict["apple-id"] = account.email;
  metadataDict["userName"] = account.email;
  delete metadataDict.passwordToken;
  const iTunesMetadataXml = buildPlist(metadataDict);

  return {
    output: {
      downloadURL: url,
      sinfs,
      bundleShortVersionString: version,
      bundleVersion,
      iTunesMetadataXml,
    },
    updatedCookies,
  };
}

/** Lists historical build external-version-ids, oldest first. */
export async function listVersions(
  account: AccountSession,
  trackId: number,
): Promise<{ versions: string[]; updatedCookies: Cookie[] }> {
  const { dict, updatedCookies } = await queryStore(account, trackId, {});

  const songList = dict.songList as Record<string, unknown>[] | undefined;
  const item = songList?.[0];
  if (!item) {
    if (dict.failureType) throwFailure(dict);
    throw new DownloadError("Apple khong tra ve item nao");
  }

  const metadata = item.metadata as Record<string, unknown> | undefined;
  const identifiers = metadata?.softwareVersionExternalIdentifiers as
    | unknown[]
    | undefined;
  if (!identifiers?.length) throw new DownloadError("Khong tim thay danh sach phien ban");

  return {
    versions: identifiers.map((id) => String(id)).reverse(),
    updatedCookies,
  };
}
