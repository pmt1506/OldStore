import { Router, type Request, type Response } from "express";
import { getAccount } from "../services/accountStore.js";
import { getJob, startDownloadJob } from "../services/downloadJobs.js";

const router = Router();

// Kicks off license-check + download + SINF injection as a background job
// (IPAs can be hundreds of MB, too slow for one request/response). Poll
// GET /api/downloads/:id for progress.
router.post("/downloads", (req: Request, res: Response) => {
  const { email, trackId, versionId, country } = req.body as {
    email?: string;
    trackId?: number;
    versionId?: string;
    country?: string;
  };
  if (!email || !trackId) {
    res.status(400).json({ error: "Thieu email hoac trackId" });
    return;
  }
  if (!getAccount(email)) {
    res.status(400).json({ error: "Tai khoan chua dang nhap" });
    return;
  }

  const job = startDownloadJob(email, Number(trackId), versionId, country);
  res.status(202).json(job);
});

router.get("/downloads/:id", (req: Request, res: Response) => {
  const job = getJob(req.params.id ?? "");
  if (!job) {
    res.status(404).json({ error: "Khong tim thay job" });
    return;
  }
  res.json(job);
});

export default router;
