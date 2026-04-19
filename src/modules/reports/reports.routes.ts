import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";

export const reportsRouter = Router();

reportsRouter.use(authenticate);
reportsRouter.use(requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER"]));

reportsRouter.get("/daily", async (req: AuthenticatedRequest, res) => {
  const dateInput = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);
  const start = new Date(`${dateInput}T00:00:00.000Z`);
  const end = new Date(`${dateInput}T23:59:59.999Z`);

  const [payments, orders, lowStockItems] = await Promise.all([
    prisma.payment.findMany({
      where: {
        tenantId: req.auth!.tenantId,
        paidAt: { gte: start, lte: end }
      }
    }),
    prisma.order.findMany({
      where: {
        tenantId: req.auth!.tenantId,
        createdAt: { gte: start, lte: end }
      },
      include: { items: true }
    }),
    prisma.stockItem.findMany({
      where: { tenantId: req.auth!.tenantId },
      orderBy: { name: "asc" }
    })
  ]);

  return res.json({
    date: dateInput,
    salesTotal: payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    paymentCount: payments.length,
    ordersCount: orders.length,
    itemsSold: orders.flatMap((order) => order.items).reduce((sum, item) => sum + item.quantity, 0),
    lowStockItems: lowStockItems
      .filter((item) => Number(item.quantity) <= Number(item.reorderLevel))
      .map((item) => ({
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity),
        reorderLevel: Number(item.reorderLevel),
        unit: item.unit
      }))
  });
});
