import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(16),
  PORT: z.coerce.number().default(4000),
  FRONTEND_URL: z.string().url(),
  ALLOWED_ORIGINS: z.string().default(""),
  TENANT_SEED_SLUG: z.string().default("demo-restaurant"),
  MPESA_MODE: z.enum(["mock", "live"]).default("mock"),
  SMS_MODE: z.enum(["mock", "live"]).default("live"),
  ADVANTA_PARTNER_ID: z.string().default("8790"),
  ADVANTA_API_KEY: z.string().default(""),
  ADVANTA_SENDER_ID: z.string().default("MARYAS"),
  ADVANTA_SMS_ENDPOINT: z.string().default("https://quicksms.advantasms.com/api/services/sendsms/"),
  ADVANTA_BALANCE_ENDPOINT: z.string().default("https://quicksms.advantasms.com/api/services/getbalance/")
});

export const env = envSchema.parse(process.env);
