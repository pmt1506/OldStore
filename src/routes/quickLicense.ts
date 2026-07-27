import { Router, type Request, type Response } from "express";
import { authenticate, AuthenticationError } from "../apple/auth.js";
import { generateDeviceId } from "../apple/constants.js";
import { purchaseApp, PurchaseError } from "../apple/purchase.js";
import { lookupSoftware, parseAppStoreInput } from "../apple/lookup.js";

const router = Router();

/**
 * Login + get-license in a single request/response, with nothing persisted
 * to disk or memory afterwards. This is what makes "get license" possible
 * on Vercel: the whole Apple auth + buyProduct sequence runs inside one
 * serverless invocation, so it never depends on a session surviving between
 * separate HTTP requests (which Vercel does not guarantee).
 *
 * Works identically when self-hosted; it's just redundant there since the
 * full login/license/download flow already covers this.
 */
router.post("/quick-license", async (req: Request, res: Response) => {
  const { email, password, code, deviceId, q, country } = req.body as {
    email?: string;
    password?: string;
    code?: string;
    deviceId?: string;
    q?: string;
    country?: string;
  };

  if (!email || !password || !q) {
    res.status(400).json({ error: "Thieu email, password hoac q (link App Store / bundleId / trackId)" });
    return;
  }

  let software;
  try {
    const parsed = parseAppStoreInput(q);
    software = await lookupSoftware(parsed, country);
    if (!software) {
      res.status(404).json({ error: "Khong tim thay app" });
      return;
    }
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "Tra cuu that bai" });
    return;
  }

  const guid = (deviceId || generateDeviceId()).replace(/[^a-fA-F0-9]/g, "");

  try {
    const account = await authenticate(email, password, code, guid);
    await purchaseApp(account, software.trackId, software.price);
    res.json({
      licensed: true,
      software,
      account: { email: account.email, appleId: account.appleId, store: account.store },
    });
  } catch (err) {
    if (err instanceof AuthenticationError && err.codeRequired) {
      res.status(200).json({ needsCode: true, deviceId: guid, message: err.message });
      return;
    }
    const message = err instanceof Error ? err.message : "Lay license that bai";
    const code2 = err instanceof PurchaseError ? err.code : undefined;
    res.status(400).json({ error: message, code: code2 });
  }
});

export default router;
