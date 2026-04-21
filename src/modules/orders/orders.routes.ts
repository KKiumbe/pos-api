import { OrderStatus, OrderType } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { sendSms } from "../integrations/sms.service.js";
import { getBusinessDayRange } from "../../utils/business-day.js";
import { generateOrderNumber } from "../../utils/order-number.js";
import { serializeOrder } from "../../utils/serializers.js";

export const ordersRouter = Router();

ordersRouter.use(authenticate);

const orderInclude = {
  items: { include: { menuItem: { select: { id: true, name: true } } } },
  payments: true,
  table: { select: { id: true, label: true } },
  deliveryAgent: { select: { id: true, tenantId: true, firstName: true, lastName: true, phone: true, notes: true, isActive: true, createdAt: true, updatedAt: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } }
} as const;

function convertRecipeQuantity(quantity: number, fromUnit: string, toUnit: string) {
  if (fromUnit === toUnit) {
    return quantity;
  }

  const mass: Record<string, number> = {
    KILOGRAM: 1000,
    GRAM: 1
  };
  const volume: Record<string, number> = {
    LITER: 1000,
    MILLILITER: 1
  };

  if (fromUnit in mass && toUnit in mass) {
    return (quantity * mass[fromUnit]) / mass[toUnit];
  }

  if (fromUnit in volume && toUnit in volume) {
    return (quantity * volume[fromUnit]) / volume[toUnit];
  }

  throw new Error(`Cannot deduct ${fromUnit} from stock tracked in ${toUnit}.`);
}

async function deductInventoryForOrder(tx: any, order: any) {
  if (order.inventoryDeducted) {
    return;
  }

  for (const item of order.items) {
    if (item.menuItem.stockItem) {
      const stockItem = await tx.stockItem.findUniqueOrThrow({
        where: { id: item.menuItem.stockItem.id }
      });

      await tx.stockItem.update({
        where: { id: stockItem.id },
        data: {
          quantity: Number(stockItem.quantity) - item.quantity
        }
      });
    }

    if (!item.menuItem.recipe) {
      continue;
    }

    const recipe = await tx.recipe.findUnique({
      where: { id: item.menuItem.recipe.id },
      include: { items: true }
    });

    if (!recipe) {
      continue;
    }

    for (const recipeItem of recipe.items) {
      const stockItem = await tx.stockItem.findUniqueOrThrow({
        where: { id: recipeItem.stockItemId }
      });

      await tx.stockItem.update({
        where: { id: stockItem.id },
        data: {
          quantity: Number(stockItem.quantity) - convertRecipeQuantity(Number(recipeItem.quantity), recipeItem.unit, stockItem.unit) * item.quantity
        }
      });
    }
  }

  await tx.order.update({
    where: { id: order.id },
    data: { inventoryDeducted: true }
  });
}

function buildDispatchSms({
  orderNumber,
  tenantName,
  customerName,
  deliveryLocation
}: {
  orderNumber: string;
  tenantName: string;
  customerName: string | null;
  deliveryLocation: string | null;
}) {
  const destination = deliveryLocation ? ` for ${deliveryLocation}` : "";
  const customer = customerName ? ` for ${customerName}` : "";
  return `New pickup ${orderNumber} at ${tenantName}${customer}${destination}. Please come to the restaurant ASAP.`;
}

ordersRouter.get("/", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER", "KITCHEN", "DELIVERY"]), async (req: AuthenticatedRequest, res) => {
  const status = req.query.status ? String(req.query.status) : undefined;
  const scope = req.query.scope ? String(req.query.scope) : "today";
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.auth!.tenantId },
    select: { timezone: true }
  });
  const businessDay = getBusinessDayRange(
    req.query.date ? String(req.query.date) : undefined,
    tenant?.timezone ?? "Africa/Nairobi"
  );
  const dateWhere = scope === "all"
    ? {}
    : { createdAt: { gte: businessDay.start, lte: businessDay.end } };
  const baseWhere =
    req.auth!.role === "DELIVERY"
      ? {
          tenantId: req.auth!.tenantId,
          ...dateWhere,
          type: OrderType.TAKEAWAY,
          status: { in: [OrderStatus.READY, OrderStatus.PAID] }
        }
      : {
          tenantId: req.auth!.tenantId,
          ...dateWhere
        };

  const orders = await prisma.order.findMany({
    where: {
      ...baseWhere,
      ...(status ? { status: status as OrderStatus } : {})
    },
    include: orderInclude,
    orderBy: { createdAt: "desc" }
  });

  return res.json(orders.map(serializeOrder));
});

ordersRouter.post("/", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER"]), async (req: AuthenticatedRequest, res) => {
  const type = String(req.body?.type ?? "") as OrderType;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const tableId = req.body?.tableId ? Number(req.body.tableId) : null;
  const deliveryAgentId = req.body?.deliveryAgentId ? Number(req.body.deliveryAgentId) : null;
  const dispatchSmsRequested = deliveryAgentId ? req.body?.dispatchSmsRequested !== false : false;

  if (!Object.values(OrderType).includes(type) || items.length === 0) {
    return res.status(400).json({ message: "Order type and at least one item are required." });
  }

  if (type === OrderType.DINE_IN && deliveryAgentId) {
    return res.status(400).json({ message: "Delivery assignment is only available for takeaway orders." });
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

  let deliveryAgent = null;
  if (deliveryAgentId) {
    deliveryAgent = await prisma.deliveryAgent.findFirst({
      where: {
        id: deliveryAgentId,
        tenantId: req.auth!.tenantId,
        isActive: true
      }
    });

    if (!deliveryAgent) {
      return res.status(404).json({ message: "Selected delivery person was not found." });
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
      deliveryAgentId: type === OrderType.TAKEAWAY ? deliveryAgentId : null,
      dispatchSmsRequested,
      dispatchSmsSentAt: null,
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
    include: orderInclude
  });

  if (type === OrderType.TAKEAWAY && deliveryAgent && dispatchSmsRequested) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.auth!.tenantId },
      select: { name: true }
    });

    const smsText = buildDispatchSms({
      orderNumber: order.orderNumber,
      tenantName: tenant?.name ?? "the restaurant",
      customerName: order.customerName,
      deliveryLocation: order.deliveryLocation
    });

    sendSms(req.auth!.tenantId, deliveryAgent.phone, smsText)
      .then(async () => {
        await prisma.order.update({
          where: { id: order.id },
          data: { dispatchSmsSentAt: new Date() }
        });
      })
      .catch(() => {});
  }

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

  if (status === OrderStatus.VOIDED) {
    const blockedStatuses: OrderStatus[] = [OrderStatus.READY, OrderStatus.PAID];
    if (blockedStatuses.includes(order.status)) {
      return res.status(400).json({ message: "Only orders that are not ready can be cancelled." });
    }
  }

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { status },
    include: orderInclude
  });

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

  await prisma.$transaction(async (tx) => {
    await tx.orderItem.update({
      where: { id: itemId },
      data: { status: status as never }
    });

    const refreshedOrder = await tx.order.findFirstOrThrow({
      where: { id: orderId, tenantId: req.auth!.tenantId },
      include: {
        items: {
          include: {
            menuItem: {
              include: {
                recipe: {
                  include: {
                    items: true
                  }
                },
                stockItem: true
              }
            }
          }
        },
        payments: true
      }
    });

    const allReady = refreshedOrder.items.every((entry) => entry.status === "READY");
    if (!allReady) {
      const someReady = refreshedOrder.items.some((entry) => entry.status === "READY");
      if (someReady && refreshedOrder.status === OrderStatus.SENT_TO_KITCHEN) {
        await tx.order.update({
          where: { id: refreshedOrder.id },
          data: { status: OrderStatus.PARTIALLY_READY }
        });
      }
      return;
    }

    const totalDue = refreshedOrder.items.reduce((sum, entry) => sum + Number(entry.unitPrice) * entry.quantity, 0);
    const paidTotal = refreshedOrder.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    if (!refreshedOrder.inventoryDeducted) {
      await deductInventoryForOrder(tx, refreshedOrder);
    }

    await tx.order.update({
      where: { id: refreshedOrder.id },
      data: {
        status: paidTotal >= totalDue ? OrderStatus.PAID : OrderStatus.READY
      }
    });
  });

  const refreshed = await prisma.order.findFirstOrThrow({
    where: { id: orderId, tenantId: req.auth!.tenantId },
    include: orderInclude
  });

  return res.json(serializeOrder(refreshed));
});
