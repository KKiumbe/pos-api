import { NextFunction, Request, Response } from "express";

import { verifyAuthToken } from "../lib/auth.js";

export type AuthenticatedRequest = Request & {
  auth?: {
    userId: number;
    tenantId: number;
    role: string;
  };
};

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authorization token is required." });
  }

  try {
    req.auth = verifyAuthToken(header.slice(7));
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid authorization token." });
  }
}
