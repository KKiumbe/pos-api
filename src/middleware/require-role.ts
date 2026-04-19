import { NextFunction, Response } from "express";

import { type AuthenticatedRequest } from "./authenticate.js";

export function requireRole(roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      return res.status(403).json({ message: "You do not have permission for this action." });
    }

    return next();
  };
}
