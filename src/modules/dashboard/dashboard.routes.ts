import { Router } from "express";
import { OrderStatus } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { getBusinessDayRange } from "../../utils/business-day.js";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", authenticate, requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DELIVERY"]), async (req: AuthenticatedRequest, res) => {
  const tenantId = req.auth!.tenantId;
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { timezone: true }
  });
  const businessDay = getBusinessDayRange(
    req.query.date ? String(req.query.date) : undefined,
    tenant?.timezone ?? "Africa/Nairobi"
  );

  const [openOrders, readyOrders, stockItems, todayPayments, tableCount, menuCount] =
    await Promise.all([
      prisma.order.count({
        where: {
          tenantId,
          createdAt: { gte: businessDay.start, lte: businessDay.end },
          status: { in: [OrderStatus.OPEN, OrderStatus.SENT_TO_KITCHEN, OrderStatus.PARTIALLY_READY] }
        }
      }),
      prisma.order.count({
        where: {
          tenantId,
          createdAt: { gte: businessDay.start, lte: businessDay.end },
          status: OrderStatus.READY
        }
      }),
      prisma.stockItem.findMany({
        where: { tenantId },
        select: { quantity: true, reorderLevel: true }
      }),
      prisma.payment.aggregate({
        where: { tenantId, paidAt: { gte: businessDay.start, lte: businessDay.end } },
        _sum: { amount: true }
      }),
      prisma.table.count({ where: { tenantId, isActive: true } }),
      prisma.menuItem.count({ where: { tenantId } })
    ]);

  return res.json({
    openOrders,
    readyOrders,
    lowStockItems: stockItems.filter((item) => Number(item.quantity) <= Number(item.reorderLevel)).length,
    businessDate: businessDay.date,
    todaySales:
      req.auth!.role === "KITCHEN" || req.auth!.role === "DELIVERY"
        ? null
        : todayPayments._sum.amount
          ? Number(todayPayments._sum.amount)
          : 0,
    activeTables: tableCount,
    menuItems: menuCount
  });
});
