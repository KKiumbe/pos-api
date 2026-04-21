import { Router } from "express";
import { StockItemType, StockUnit } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { serializeStockItem } from "../../utils/serializers.js";

export const inventoryRouter = Router();

inventoryRouter.use(authenticate);

inventoryRouter.get("/items", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER"]), async (req: AuthenticatedRequest, res) => {
  const items = await prisma.stockItem.findMany({
    where: { tenantId: req.auth!.tenantId },
    include: { menuItem: { select: { id: true, name: true } } },
    orderBy: { name: "asc" }
  });

  return res.json(items.map(serializeStockItem));
});

inventoryRouter.get("/recipes", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER"]), async (req: AuthenticatedRequest, res) => {
  const recipes = await prisma.recipe.findMany({
    where: { tenantId: req.auth!.tenantId },
    include: {
      menuItem: { select: { id: true, name: true } },
      items: {
        include: {
          stockItem: { select: { id: true, name: true, unit: true, type: true } }
        }
      }
    },
    orderBy: { menuItem: { name: "asc" } }
  });

  return res.json(
    recipes.map((recipe) => ({
      id: recipe.id,
      menuItem: recipe.menuItem,
      items: recipe.items.map((item) => ({
        id: item.id,
        quantity: Number(item.quantity),
        unit: item.unit,
        stockItem: item.stockItem
      }))
    }))
  );
});

inventoryRouter.post("/items", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const name = String(req.body?.name ?? "").trim();
  const unit = String(req.body?.unit ?? "").trim() as StockUnit;
  const quantity = Number(req.body?.quantity);
  const reorderLevel = Number(req.body?.reorderLevel ?? 0);
  const type = String(req.body?.type ?? StockItemType.CONSUMABLE) as StockItemType;
  const menuItemId = req.body?.menuItemId ? Number(req.body.menuItemId) : null;

  if (!name || !Object.values(StockUnit).includes(unit) || Number.isNaN(quantity) || !Object.values(StockItemType).includes(type)) {
    return res.status(400).json({ message: "Name, unit, quantity, and valid inventory type are required." });
  }

  if (type === StockItemType.MENU) {
    if (!menuItemId || Number.isNaN(menuItemId)) {
      return res.status(400).json({ message: "Menu inventory items must be linked to a menu item." });
    }

    const menuItem = await prisma.menuItem.findFirst({
      where: { id: menuItemId, tenantId: req.auth!.tenantId }
    });

    if (!menuItem) {
      return res.status(404).json({ message: "Linked menu item was not found." });
    }
  }

  const item = await prisma.stockItem.create({
    data: {
      tenantId: req.auth!.tenantId,
      type,
      menuItemId: type === StockItemType.MENU ? menuItemId : null,
      name,
      unit,
      quantity,
      reorderLevel
    },
    include: { menuItem: { select: { id: true, name: true } } }
  });

  return res.status(201).json(serializeStockItem(item));
});

inventoryRouter.patch("/items/:id", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const itemId = Number(req.params.id);
  const name = req.body?.name === undefined ? undefined : String(req.body.name).trim();
  const unit = req.body?.unit === undefined ? undefined : String(req.body.unit).trim() as StockUnit;
  const quantity = req.body?.quantity == null ? undefined : Number(req.body.quantity);
  const reorderLevel = req.body?.reorderLevel == null ? undefined : Number(req.body.reorderLevel);
  const type = req.body?.type === undefined ? undefined : String(req.body.type) as StockItemType;
  const menuItemId = req.body?.menuItemId === undefined ? undefined : req.body.menuItemId ? Number(req.body.menuItemId) : null;

  if (Number.isNaN(itemId)) {
    return res.status(400).json({ message: "Valid stock item id is required." });
  }

  if (name === undefined && unit === undefined && quantity === undefined && reorderLevel === undefined && type === undefined && menuItemId === undefined) {
    return res.status(400).json({ message: "At least one stock field is required." });
  }

  if ((quantity !== undefined && Number.isNaN(quantity)) || (reorderLevel !== undefined && Number.isNaN(reorderLevel)) || (menuItemId !== undefined && menuItemId !== null && Number.isNaN(menuItemId))) {
    return res.status(400).json({ message: "Quantity and reorder level must be valid numbers." });
  }

  if (type !== undefined && !Object.values(StockItemType).includes(type)) {
    return res.status(400).json({ message: "Valid inventory type is required." });
  }

  if ((name !== undefined && !name) || (unit !== undefined && !Object.values(StockUnit).includes(unit))) {
    return res.status(400).json({ message: "Name cannot be empty and unit must be valid." });
  }

  const existing = await prisma.stockItem.findFirst({
    where: { id: itemId, tenantId: req.auth!.tenantId }
  });

  if (!existing) {
    return res.status(404).json({ message: "Stock item not found." });
  }

  const nextType = type ?? existing.type;
  const nextMenuItemId = menuItemId === undefined ? existing.menuItemId : menuItemId;

  if (nextType === StockItemType.MENU) {
    if (!nextMenuItemId) {
      return res.status(400).json({ message: "Menu inventory items must be linked to a menu item." });
    }

    const menuItem = await prisma.menuItem.findFirst({
      where: { id: nextMenuItemId, tenantId: req.auth!.tenantId }
    });

    if (!menuItem) {
      return res.status(404).json({ message: "Linked menu item was not found." });
    }
  }

  const updated = await prisma.stockItem.update({
    where: { id: itemId },
    data: {
      ...(type !== undefined ? { type } : {}),
      ...(type === StockItemType.CONSUMABLE ? { menuItemId: null } : {}),
      ...(nextType === StockItemType.MENU && menuItemId !== undefined ? { menuItemId } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(unit !== undefined ? { unit } : {}),
      ...(quantity !== undefined ? { quantity } : {}),
      ...(reorderLevel !== undefined ? { reorderLevel } : {})
    },
    include: { menuItem: { select: { id: true, name: true } } }
  });

  return res.json(serializeStockItem(updated));
});

inventoryRouter.post("/recipes", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const menuItemId = Number(req.body?.menuItemId);
  const items = Array.isArray(req.body?.items) ? req.body.items : [];

  if (Number.isNaN(menuItemId) || items.length === 0) {
    return res.status(400).json({ message: "Menu item and recipe items are required." });
  }

  const normalizedItems: Array<{ stockItemId: number; quantity: number; unit?: StockUnit }> = items.map(
    (item: { stockItemId: number; quantity: number; unit?: StockUnit }) => ({
      stockItemId: Number(item.stockItemId),
      quantity: Number(item.quantity),
      unit: item.unit ? String(item.unit).trim() as StockUnit : undefined
    })
  );

  if (
    normalizedItems.some(
      (item) => Number.isNaN(item.stockItemId) || Number.isNaN(item.quantity) || item.quantity <= 0 || (item.unit !== undefined && !Object.values(StockUnit).includes(item.unit))
    )
  ) {
    return res.status(400).json({ message: "Recipe items must include a valid stock item and quantity." });
  }

  const menuItem = await prisma.menuItem.findFirst({
    where: { id: menuItemId, tenantId: req.auth!.tenantId }
  });

  if (!menuItem) {
    return res.status(404).json({ message: "Menu item not found." });
  }

  const stockItems = await prisma.stockItem.findMany({
    where: {
      tenantId: req.auth!.tenantId,
      id: { in: normalizedItems.map((item) => item.stockItemId) }
    },
    select: { id: true, type: true, unit: true }
  });

  if (stockItems.length !== new Set(normalizedItems.map((item) => item.stockItemId)).size) {
    return res.status(404).json({ message: "One or more stock items were not found." });
  }

  if (stockItems.some((item) => item.type !== StockItemType.CONSUMABLE)) {
    return res.status(400).json({ message: "Recipes can only use consumable stock items." });
  }

  const recipe = await prisma.recipe.upsert({
    where: { menuItemId },
    create: {
      tenantId: req.auth!.tenantId,
      menuItemId,
      items: {
        create: normalizedItems.map((item) => ({
          stockItemId: item.stockItemId,
          quantity: item.quantity,
          unit: item.unit ?? stockItems.find((stockItem) => stockItem.id === item.stockItemId)!.unit
        }))
      }
    },
    update: {
      items: {
        deleteMany: {},
        create: normalizedItems.map((item) => ({
          stockItemId: item.stockItemId,
          quantity: item.quantity,
          unit: item.unit ?? stockItems.find((stockItem) => stockItem.id === item.stockItemId)!.unit
        }))
      }
    },
    include: {
      menuItem: { select: { id: true, name: true } },
      items: {
        include: {
          stockItem: { select: { id: true, name: true, unit: true } }
        }
      }
    }
  });

  return res.status(201).json({
    id: recipe.id,
    menuItem: recipe.menuItem,
    items: recipe.items.map((item) => ({
      id: item.id,
      quantity: Number(item.quantity),
      unit: item.unit,
      stockItem: item.stockItem
    }))
  });
});
