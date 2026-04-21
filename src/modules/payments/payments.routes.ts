import { PaymentMethod, PaymentStatus } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { serializeOrder } from "../../utils/serializers.js";

export const paymentsRouter = Router();

paymentsRouter.use(authenticate);
paymentsRouter.use(requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER"]));

paymentsRouter.post("/", async (req: AuthenticatedRequest, res) => {
  const orderId = Number(req.body?.orderId);
  const method = String(req.body?.method ?? "") as PaymentMethod;
  const amount = Number(req.body?.amount);

  if (Number.isNaN(orderId) || Number.isNaN(amount) || !Object.values(PaymentMethod).includes(method)) {
    return res.status(400).json({ message: "Order, payment method, and amount are required." });
  }

  const order = await prisma.order.findFirst({
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
              }
            }
          }
        }
      }
    }
  });

  if (!order) {
    return res.status(404).json({ message: "Order not found." });
  }

  const totalDue = order.items.reduce((sum, item) => sum + Number(item.unitPrice) * item.quantity, 0);
  if (amount <= 0 || amount > totalDue) {
    return res.status(400).json({ message: "Payment amount must be greater than zero and not exceed order total." });
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        tenantId: req.auth!.tenantId,
        orderId: order.id,
        method,
        amount,
        status: PaymentStatus.COMPLETED,
        reference: req.body?.reference ? String(req.body.reference) : null
      }
    });

    const payments = await tx.payment.findMany({
      where: { orderId: order.id, tenantId: req.auth!.tenantId }
    });

    const paidTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);

    if (paidTotal >= totalDue && order.status === "READY") {
      await tx.order.update({
        where: { id: order.id },
        data: {
          status: "PAID"
        }
      });
    }
  });

  const updatedOrder = await prisma.order.findFirstOrThrow({
    where: { id: order.id, tenantId: req.auth!.tenantId },
    include: {
      items: { include: { menuItem: { select: { id: true, name: true } } } },
      payments: true,
      table: { select: { id: true, label: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } }
    }
  });

  return res.status(201).json(serializeOrder(updatedOrder));
});
