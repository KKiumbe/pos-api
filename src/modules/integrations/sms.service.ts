import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

function sanitizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.startsWith("7") && digits.length === 9) return "254" + digits;
  return null;
}

export function looksLikePhone(str: string): boolean {
  const digits = str.replace(/\D/g, "");
  return digits.length >= 9 && /^[\d+\s\-()]+$/.test(str.trim());
}

type AdvantaSendResponse = {
  success?: boolean;
  messageId?: string;
  description?: string;
  error?: string;
  [key: string]: unknown;
};

type AdvantaBalanceResponse = {
  balance?: number | string;
  credit?: number | string;
  description?: string;
  [key: string]: unknown;
};

export async function sendSms(tenantId: number, recipient: string, message: string) {
  const sanitized = sanitizePhone(recipient);
  if (!sanitized) throw new Error(`Invalid phone number: ${recipient}`);

  const record = await prisma.smsMessage.create({
    data: { tenantId, recipient: sanitized, message, status: "PENDING", provider: "advanta" }
  });

  if (env.SMS_MODE === "mock") {
    await prisma.smsMessage.update({
      where: { id: record.id },
      data: { status: "SENT", sentAt: new Date() }
    });
    return { success: true, mock: true };
  }

  try {
    const payload = {
      apikey: env.ADVANTA_API_KEY,
      partnerID: env.ADVANTA_PARTNER_ID,
      message,
      shortcode: env.ADVANTA_SENDER_ID,
      mobile: sanitized
    };

    const res = await fetch(env.ADVANTA_SMS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000)
    });

    const data = await res.json() as AdvantaSendResponse;

    await prisma.smsMessage.update({
      where: { id: record.id },
      data: { status: "SENT", sentAt: new Date() }
    });

    return data;
  } catch (error: unknown) {
    await prisma.smsMessage.update({
      where: { id: record.id },
      data: { status: "FAILED" }
    });
    const msg = error instanceof Error ? error.message : "SMS delivery failed";
    throw new Error(msg);
  }
}

export async function getSmsBalance(): Promise<{ balance: number; currency: string }> {
  if (env.SMS_MODE === "mock") {
    return { balance: 9999, currency: "KES" };
  }

  try {
    const payload = {
      apikey: env.ADVANTA_API_KEY,
      partnerID: env.ADVANTA_PARTNER_ID
    };

    const res = await fetch(env.ADVANTA_BALANCE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000)
    });

    const data = await res.json() as AdvantaBalanceResponse;
    const raw = data?.balance ?? data?.credit ?? 0;
    return { balance: Number(raw), currency: "KES" };
  } catch {
    throw new Error("Unable to fetch SMS balance.");
  }
}
