import { Router, type Request, type Response } from "express";
import { purchaseApp, PurchaseError } from "../apple/purchase.js";
import { lookupSoftware } from "../apple/lookup.js";
import { getAccount, upsertAccount } from "../services/accountStore.js";

const router = Router();

// Acquires (or confirms) a license for a free app under a saved Apple ID —
// the "buyProduct" $0 purchase — without downloading anything yet.
router.post("/license", async (req: Request, res: Response) => {
  const { email, trackId, country } = req.body as {
    email?: string;
    trackId?: number;
    country?: string;
  };
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
    const software = await lookupSoftware({ trackId: String(trackId), country: country ?? "us" }, country);
    if (!software) {
      res.status(404).json({ error: "Khong tim thay app" });
      return;
    }

    const updatedCookies = await purchaseApp(account, trackId, software.price);
    upsertAccount({ ...account, cookies: updatedCookies, updatedAt: new Date().toISOString() });
    res.json({ licensed: true, software });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Lay license that bai";
    const code = err instanceof PurchaseError ? err.code : undefined;
    res.status(400).json({ error: message, code });
  }
});

export default router;
