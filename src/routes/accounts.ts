import { Router, type Request, type Response } from "express";
import { authenticate, AuthenticationError } from "../apple/auth.js";
import { generateDeviceId } from "../apple/constants.js";
import { getAccount, listAccounts, removeAccount, upsertAccount } from "../services/accountStore.js";

const router = Router();

router.get("/accounts", (_req: Request, res: Response) => {
  res.json(listAccounts());
});

router.post("/accounts/login", async (req: Request, res: Response) => {
  const { email, password, code, deviceId } = req.body as {
    email?: string;
    password?: string;
    code?: string;
    deviceId?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: "Thieu email hoac password" });
    return;
  }

  const guid = (deviceId || generateDeviceId()).replace(/[^a-fA-F0-9]/g, "");

  try {
    const session = await authenticate(email, password, code, guid);
    upsertAccount(session);
    res.json({
      email: session.email,
      appleId: session.appleId,
      store: session.store,
      firstName: session.firstName,
      lastName: session.lastName,
      updatedAt: session.updatedAt,
    });
  } catch (err) {
    if (err instanceof AuthenticationError && err.codeRequired) {
      res.status(200).json({ needsCode: true, deviceId: guid, message: err.message });
      return;
    }
    res.status(400).json({ error: err instanceof Error ? err.message : "Dang nhap that bai" });
  }
});

router.delete("/accounts/:email", (req: Request, res: Response) => {
  const email = decodeURIComponent(req.params.email ?? "");
  const existing = getAccount(email);
  if (!existing) {
    res.status(404).json({ error: "Khong tim thay tai khoan" });
    return;
  }
  removeAccount(email);
  res.json({ success: true });
});

export default router;
