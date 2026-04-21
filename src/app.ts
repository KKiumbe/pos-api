import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { dashboardRouter } from "./modules/dashboard/dashboard.routes.js";
import { deliveryAgentsRouter } from "./modules/delivery-agents/delivery-agents.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { inventoryRouter } from "./modules/inventory/inventory.routes.js";
import { integrationsRouter } from "./modules/integrations/integrations.routes.js";
import { menuRouter } from "./modules/menu/menu.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { paymentsRouter } from "./modules/payments/payments.routes.js";
import { reportsRouter } from "./modules/reports/reports.routes.js";
import { staffRouter } from "./modules/staff/staff.routes.js";
import { tablesRouter } from "./modules/tables/tables.routes.js";
import { tenantRouter } from "./modules/tenant/tenant.routes.js";

export const app = express();

app.use(helmet());
const allowedOrigins = new Set([
  env.FRONTEND_URL,
  ...env.ALLOWED_ORIGINS,
  ...env.CORS_ORIGINS
]);

function isAllowedOrigin(origin: string) {
  if (allowedOrigins.has(origin)) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const isLocalhost =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");

    return isLocalhost;
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin(origin, callback) {
      // Allow requests with no origin (e.g. curl, mobile apps, same-origin)
      if (!origin || isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
    },
    credentials: true
  })
);
app.use(express.json());

app.use("/health", healthRouter);
app.use("/auth", authRouter);
app.use("/admin", adminRouter);
app.use("/dashboard", dashboardRouter);
app.use("/delivery-agents", deliveryAgentsRouter);
app.use("/menu", menuRouter);
app.use("/tables", tablesRouter);
app.use("/orders", ordersRouter);
app.use("/payments", paymentsRouter);
app.use("/inventory", inventoryRouter);
app.use("/reports", reportsRouter);
app.use("/integrations", integrationsRouter);
app.use("/staff", staffRouter);
app.use("/tenant", tenantRouter);
