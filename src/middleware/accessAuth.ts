import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { config } from "../config.js";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** No-op unless ACCESS_PASSWORD is set — this tool is meant to run on localhost/LAN. */
export function accessAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.accessPassword) {
    next();
    return;
  }
  const supplied = req.header("x-access-password") ?? "";
  if (safeEqual(supplied, config.accessPassword)) {
    next();
    return;
  }
  res.status(401).json({ error: "Sai hoac thieu X-Access-Password" });
}
