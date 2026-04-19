import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { serializeStockItem } from "../../utils/serializers.js";

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

inventoryRouter.get("/items", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER"]), async (req: AuthenticatedRequest, res) => {
  const items = await prisma.stockItem.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: { name: "asc" }
  });

  return res.json(items.map(serializeStockItem));
});

inventoryRouter.post("/items", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const name = String(req.body?.name ?? "").trim();
  const unit = String(req.body?.unit ?? "").trim();
  const quantity = Number(req.body?.quantity);
  const reorderLevel = Number(req.body?.reorderLevel ?? 0);

  if (!name || !unit || Number.isNaN(quantity)) {
    return res.status(400).json({ message: "Name, unit, and quantity are required." });
  }

  const item = await prisma.stockItem.create({
    data: {
      tenantId: req.auth!.tenantId,
      name,
      unit,
      quantity,
      reorderLevel
    }
  });

  return res.status(201).json(serializeStockItem(item));
});

inventoryRouter.post("/recipes", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const menuItemId = Number(req.body?.menuItemId);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (Number.isNaN(menuItemId) || items.length === 0) {
    return res.status(400).json({ message: "Menu item and recipe items are required." });
  }

  const menuItem = await prisma.menuItem.findFirst({
    where: { id: menuItemId, tenantId: req.auth!.tenantId }
  });

  if (!menuItem) {
    return res.status(404).json({ message: "Menu item not found." });
  }

  const recipe = await prisma.recipe.upsert({
    where: { menuItemId },
    create: {
      tenantId: req.auth!.tenantId,
      menuItemId,
      items: {
        create: items.map((item: { stockItemId: number; quantity: number }) => ({
          stockItemId: Number(item.stockItemId),
          quantity: Number(item.quantity)
        }))
      }
    },
    update: {
      items: {
        deleteMany: {},
        create: items.map((item: { stockItemId: number; quantity: number }) => ({
          stockItemId: Number(item.stockItemId),
          quantity: Number(item.quantity)
        }))
      }
    },
    include: { items: true }
  });

  return res.status(201).json(recipe);
});
