import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export type AuthTokenPayload = {
  userId: number;
  tenantId: number;
  role: string;
};

export function signAuthToken(payload: AuthTokenPayload) {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "12h" });
}

export function verifyAuthToken(token: string) {
  return jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
}
