import { randomInt } from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";

import { prisma } from "../../lib/prisma.js";
import { signAuthToken } from "../../lib/auth.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { sendSms, looksLikePhone } from "../integrations/sms.service.js";
import { serializeUser } from "../../utils/serializers.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "");

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const user = await prisma.user.findUnique({
    where: { email },
    include: { tenant: true }
  });

  if (!user || !user.isActive || !user.tenant.isActive) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Invalid credentials." });
  }

  const token = signAuthToken({ userId: user.id, tenantId: user.tenantId, role: user.role });

  return res.json({
    token,
    user: serializeUser(user),
    tenant: {
      id: user.tenant.id,
      name: user.tenant.name,
      slug: user.tenant.slug,
      currency: user.tenant.currency,
      timezone: user.tenant.timezone
    }
  });
});

authRouter.get("/me", authenticate, async (req: AuthenticatedRequest, res) => {
  const user = await prisma.user.findFirst({
    where: { id: req.auth!.userId, tenantId: req.auth!.tenantId },
    include: { tenant: true }
  });

  if (!user) {
    return res.status(404).json({ message: "User not found." });
  }

  return res.json({
    user: serializeUser(user),
    tenant: {
      id: user.tenant.id,
      name: user.tenant.name,
      slug: user.tenant.slug,
      currency: user.tenant.currency,
      timezone: user.tenant.timezone
    }
  });
});

// ── Forgot password — send OTP via SMS ───────────────────────────────────────

authRouter.post("/forgot-password", async (req, res) => {
  const identifier = String(req.body?.identifier ?? "").trim().toLowerCase();

  if (!identifier) {
    return res.status(400).json({ message: "Phone number or email is required." });
  }

  // Always return the same response to avoid user enumeration
  const genericOk = { message: "If this account exists, an OTP has been sent via SMS." };

  const user = await prisma.user.findUnique({ where: { email: identifier } });
  if (!user || !user.isActive) {
    return res.json(genericOk);
  }

  // Determine the phone to send OTP to
  const smsTarget = user.phone || (looksLikePhone(identifier) ? identifier : null);
  if (!smsTarget) {
    // No phone on file — cannot send SMS OTP
    return res.json(genericOk);
  }

  // Invalidate any existing unused OTPs
  await prisma.passwordResetOtp.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() }
  });

  // Generate 6-digit OTP
  const otp = String(randomInt(100000, 999999));
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await prisma.passwordResetOtp.create({
    data: { userId: user.id, otpHash, expiresAt }
  });

  const smsText = `Your TableFlow password reset OTP is: ${otp}. It expires in 10 minutes. Do not share it.`;

  // Fire-and-forget — don't block response on SMS delivery
  sendSms(user.tenantId, smsTarget, smsText).catch(() => {});

  return res.json(genericOk);
});

// ── Reset password — verify OTP + set new password ───────────────────────────

authRouter.post("/reset-password", async (req, res) => {
  const identifier = String(req.body?.identifier ?? "").trim().toLowerCase();
  const otp = String(req.body?.otp ?? "").trim();
  const newPassword = String(req.body?.newPassword ?? "");

  if (!identifier || !otp || !newPassword) {
    return res.status(400).json({ message: "Identifier, OTP, and new password are required." });
  }

  if (newPassword.length < 4) {
    return res.status(400).json({ message: "Password must be at least 4 characters." });
  }

  const user = await prisma.user.findUnique({ where: { email: identifier } });
  if (!user || !user.isActive) {
    return res.status(400).json({ message: "Invalid or expired OTP." });
  }

  const otpRecord = await prisma.passwordResetOtp.findFirst({
    where: { userId: user.id, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" }
  });

  if (!otpRecord) {
    return res.status(400).json({ message: "OTP expired or already used. Request a new one." });
  }

  const valid = await bcrypt.compare(otp, otpRecord.otpHash);
  if (!valid) {
    return res.status(400).json({ message: "Invalid OTP." });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetOtp.update({ where: { id: otpRecord.id }, data: { usedAt: new Date() } })
  ]);

  return res.json({ message: "Password reset successfully. You can now sign in." });
});
