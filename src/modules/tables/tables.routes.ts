import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";

export const tablesRouter = Router();

tablesRouter.use(authenticate);

tablesRouter.get("/", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER", "KITCHEN"]), async (req: AuthenticatedRequest, res) => {
  const tables = await prisma.table.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: { label: "asc" }
  });

  return res.json(tables);
});

tablesRouter.post("/", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const label = String(req.body?.label ?? "").trim();
  const capacity = Number(req.body?.capacity ?? 4);

  if (!label) {
    return res.status(400).json({ message: "Table label is required." });
  }

  const table = await prisma.table.create({
    data: {
      tenantId: req.auth!.tenantId,
      label,
      capacity
    }
  });

  return res.status(201).json(table);
});
