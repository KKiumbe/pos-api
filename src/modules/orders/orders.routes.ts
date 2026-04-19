import { OrderStatus, OrderType } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { sendSms } from "../integrations/sms.service.js";
import { generateOrderNumber } from "../../utils/order-number.js";
import { serializeOrder } from "../../utils/serializers.js";

export const ordersRouter = Router();

ordersRouter.use(authenticate);

ordersRouter.get("/", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DELIVERY"]), async (req: AuthenticatedRequest, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const baseWhere =
    req.auth!.role === "DELIVERY"
      ? {
          tenantId: req.auth!.tenantId,
          type: OrderType.TAKEAWAY,
          status: { in: [OrderStatus.READY, OrderStatus.PAID] }
        }
      : {
          tenantId: req.auth!.tenantId
        };

  const orders = await prisma.order.findMany({
    where: {
      ...baseWhere,
      ...(status ? { status: status as OrderStatus } : {})
    },
    include: {
      items: { include: { menuItem: { select: { id: true, name: true } } } },
      payments: true,
      table: { select: { id: true, label: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } }
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json(orders.map(serializeOrder));
});

ordersRouter.post("/", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER"]), async (req: AuthenticatedRequest, res) => {
  const type = String(req.body?.type ?? "") as OrderType;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const tableId = req.body?.tableId ? Number(req.body.tableId) : null;

  if (!Object.values(OrderType).includes(type) || items.length === 0) {
    return res.status(400).json({ message: "Order type and at least one item are required." });
  }

  const menuItemIds = items.map((item: { menuItemId: number }) => Number(item.menuItemId));
  const menuItems = await prisma.menuItem.findMany({
    where: {
      tenantId: req.auth!.tenantId,
      id: { in: menuItemIds },
      isAvailable: true
    }
  });

  if (menuItems.length !== menuItemIds.length) {
    return res.status(400).json({ message: "One or more menu items are unavailable." });
  }

  if (tableId) {
    const table = await prisma.table.findFirst({
      where: { id: tableId, tenantId: req.auth!.tenantId, isActive: true }
    });

    if (!table) {
      return res.status(404).json({ message: "Table not found." });
    }
  }

  const orderCount = await prisma.order.count({ where: { tenantId: req.auth!.tenantId } });
  const orderNumber = generateOrderNumber(orderCount + 1, type === OrderType.DINE_IN ? "DIN" : "TKW");

  const order = await prisma.order.create({
    data: {
      tenantId: req.auth!.tenantId,
      orderNumber,
      type,
      tableId,
      customerName: req.body?.customerName ? String(req.body.customerName) : null,
      customerPhone: req.body?.customerPhone ? String(req.body.customerPhone) : null,
      deliveryLocation: req.body?.deliveryLocation ? String(req.body.deliveryLocation) : null,
      deliveryAddress: req.body?.deliveryAddress ? String(req.body.deliveryAddress) : null,
      createdById: req.auth!.userId,
      items: {
        create: items.map((item: { menuItemId: number; quantity: number; notes?: string }) => {
          const menuItem = menuItems.find((entry) => entry.id === Number(item.menuItemId))!;

          return {
            menuItemId: menuItem.id,
            quantity: Number(item.quantity),
            unitPrice: menuItem.price,
            notes: item.notes ? String(item.notes) : null
          };
        })
      }
    },
    include: {
      items: { include: { menuItem: { select: { id: true, name: true } } } },
      payments: true,
      table: { select: { id: true, label: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } }
    }
  });

  return res.status(201).json(serializeOrder(order));
});

ordersRouter.patch("/:id/status", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER", "KITCHEN"]), async (req: AuthenticatedRequest, res) => {
  const orderId = Number(req.params.id);
  const status = String(req.body?.status ?? "") as OrderStatus;

  if (!Object.values(OrderStatus).includes(status)) {
    return res.status(400).json({ message: "Invalid order status." });
  }

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: req.auth!.tenantId }
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status },
    include: {
      items: { include: { menuItem: { select: { id: true, name: true } } } },
      payments: true,
      table: { select: { id: true, label: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } }
    }
  });

  // Fire-and-forget dispatch SMS for takeaway orders with a customer phone
  if (status === OrderStatus.READY && updated.type === OrderType.TAKEAWAY && updated.customerPhone) {
    const name = updated.customerName ? ` ${updated.customerName},` : "";
    const location = updated.deliveryLocation ? ` to ${updated.deliveryLocation}` : "";
    const smsText = `Hi${name} your TableFlow order #${updated.orderNumber} is ready and on its way${location}! Thank you.`;
    sendSms(req.auth!.tenantId, updated.customerPhone, smsText).catch(() => {});
  }

  return res.json(serializeOrder(updated));
});

ordersRouter.patch("/:orderId/items/:itemId/status", requireRole(["SUPER_ADMIN", "MANAGER", "KITCHEN"]), async (req: AuthenticatedRequest, res) => {
  const orderId = Number(req.params.orderId);
  const itemId = Number(req.params.itemId);
  const status = String(req.body?.status ?? "");

  const order = await prisma.order.findFirst({
    where: { id: orderId, tenantId: req.auth!.tenantId },
    include: { items: true }
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  const item = order.items.find((entry) => entry.id === itemId);
  if (!item) {
    return res.status(404).json({ message: "Order item not found." });
  }

  await prisma.orderItem.update({
    where: { id: itemId },
    data: { status: status as never }
  });

  const refreshed = await prisma.order.findFirstOrThrow({
    where: { id: orderId, tenantId: req.auth!.tenantId },
    include: {
      items: { include: { menuItem: { select: { id: true, name: true } } } },
      payments: true,
      table: { select: { id: true, label: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } }
    }
  });

  return res.json(serializeOrder(refreshed));
});
