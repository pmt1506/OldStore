import type { NextFunction, Request, Response } from "express";

export const IS_VERCEL = process.env.VERCEL === "1";

const MESSAGE =
  "Tinh nang nay can luu phien/luu tru lau dai nen khong chay tren Vercel serverless " +
  "(khong co o dia ben vung, response bi gioi han ~4.5MB). " +
  "Dung POST /api/quick-license de lay license trong 1 request, hoac tu host bang Docker " +
  "de co day du tinh nang (luu tai khoan, chon phien ban cu, tai & luu tru IPA).";

/** Mounted ahead of routes that assume a persistent filesystem / cross-request session. */
export function blockOnVercel(_req: Request, res: Response, next: NextFunction): void {
  if (!IS_VERCEL) {
    next();
    return;
  }
  res.status(501).json({ error: MESSAGE });
}
