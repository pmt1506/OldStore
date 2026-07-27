import { Router, type Request, type Response } from "express";
import fs from "node:fs";
import { filePathFor, getEntry, listEntries, removeEntry } from "../services/library.js";

const router = Router();

router.get("/library", (_req: Request, res: Response) => {
  res.json(listEntries());
});

router.get("/library/:id/file", (req: Request, res: Response) => {
  const entry = getEntry(req.params.id ?? "");
  if (!entry) {
    res.status(404).json({ error: "Khong tim thay" });
    return;
  }
  const filePath = filePathFor(entry);
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: "File khong con tren dia" });
    return;
  }
  res.download(filePath, `${entry.name}-${entry.version}.ipa`);
});

router.delete("/library/:id", (req: Request, res: Response) => {
  const removed = removeEntry(req.params.id ?? "");
  if (!removed) {
    res.status(404).json({ error: "Khong tim thay" });
    return;
  }
  res.json({ success: true });
});

export default router;
