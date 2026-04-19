import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { getSmsBalance, sendSms } from "./sms.service.js";

export const integrationsRouter = Router();

integrationsRouter.use(authenticate);
integrationsRouter.use(requireRole(["SUPER_ADMIN", "MANAGER"]));

// ── SMS ──────────────────────────────────────────────────────────────────────

integrationsRouter.get("/sms/messages", async (req: AuthenticatedRequest, res) => {
  const messages = await prisma.smsMessage.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: { createdAt: "desc" },
    take: 50
  });

  return res.json(messages);
});

integrationsRouter.post("/sms/messages", async (req: AuthenticatedRequest, res) => {
  const recipient = String(req.body?.recipient ?? "").trim();
  const message = String(req.body?.message ?? "").trim();

  if (!recipient || !message) {
    return res.status(400).json({ message: "Recipient and message are required." });
  }

  try {
    const result = await sendSms(req.auth!.tenantId, recipient, message);
    return res.status(201).json({ success: true, result });
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? error.message : "SMS failed." });
  }
});

integrationsRouter.get("/sms/balance", async (_req: AuthenticatedRequest, res) => {
  try {
    const balance = await getSmsBalance();
    return res.json(balance);
  } catch (error) {
    return res.status(503).json({ message: error instanceof Error ? error.message : "Unable to fetch balance." });
  }
});

// ── M-Pesa ───────────────────────────────────────────────────────────────────

integrationsRouter.get("/mpesa/transactions", async (req: AuthenticatedRequest, res) => {
  const transactions = await prisma.mpesaTransaction.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: { createdAt: "desc" },
    take: 20
  });

  return res.json(
    transactions.map((transaction: any) => ({
      ...transaction,
      amount: Number(transaction.amount)
    }))
  );
});
