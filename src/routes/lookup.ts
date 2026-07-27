import { Router, type Request, type Response } from "express";
import { lookupSoftware, parseAppStoreInput } from "../apple/lookup.js";
import { getAccount, upsertAccount } from "../services/accountStore.js";
import { listVersions } from "../apple/download.js";

const router = Router();

router.get("/lookup", async (req: Request, res: Response) => {
  const q = req.query.q as string | undefined;
  if (!q) {
    res.status(400).json({ error: "Thieu tham so q (link App Store / bundleId / trackId)" });
    return;
  }
  const country = (req.query.country as string | undefined)?.toLowerCase();

  try {
    const parsed = parseAppStoreInput(q);
    const software = await lookupSoftware(parsed, country);
    if (!software) {
      res.status(404).json({ error: "Khong tim thay app" });
      return;
    }
    res.json(software);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "Tra cuu that bai" });
  }
});

// Requires a logged-in account: listing historical build ids hits Apple's
// authenticated volumeStoreDownloadProduct endpoint, not the public lookup API.
router.get("/versions", async (req: Request, res: Response) => {
  const email = req.query.email as string | undefined;
  const trackId = Number(req.query.trackId);
  if (!email || !trackId) {
    res.status(400).json({ error: "Thieu email hoac trackId" });
    return;
  }
  const account = getAccount(email);
  if (!account) {
    res.status(400).json({ error: "Tai khoan chua dang nhap" });
    return;
  }

  try {
    const { versions, updatedCookies } = await listVersions(account, trackId);
    upsertAccount({ ...account, cookies: updatedCookies, updatedAt: new Date().toISOString() });
    res.json({ versions });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Khong lay duoc danh sach phien ban" });
  }
});

export default router;
