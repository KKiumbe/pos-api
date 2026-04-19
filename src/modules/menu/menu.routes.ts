import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { serializeMenuItem } from "../../utils/serializers.js";

export const menuRouter = Router();

menuRouter.use(authenticate);

menuRouter.get("/categories", async (req: AuthenticatedRequest, res) => {
  const categories = await prisma.menuCategory.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { items: { orderBy: { name: "asc" } } }
  });

  return res.json(
    categories.map((category) => ({
      id: category.id,
      name: category.name,
      sortOrder: category.sortOrder,
      isActive: category.isActive,
      items: category.items.map(serializeMenuItem)
    }))
  );
});

menuRouter.post("/categories", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const name = String(req.body?.name ?? "").trim();
  const sortOrder = Number(req.body?.sortOrder ?? 0);

  if (!name) {
    return res.status(400).json({ message: "Category name is required." });
  }

  const category = await prisma.menuCategory.create({
    data: {
      tenantId: req.auth!.tenantId,
      name,
      sortOrder
    }
  });

  return res.status(201).json(category);
});

menuRouter.patch("/items/:id", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: "Invalid item ID." });
  }

  const item = await prisma.menuItem.findFirst({
    where: { id, tenantId: req.auth!.tenantId }
  });

  if (!item) {
    return res.status(404).json({ message: "Menu item not found." });
  }

  const updates: Record<string, unknown> = {};
  if (req.body?.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body?.price !== undefined) updates.price = Number(req.body.price);
  if (req.body?.description !== undefined) updates.description = req.body.description ? String(req.body.description) : null;
  if (req.body?.isAvailable !== undefined) updates.isAvailable = Boolean(req.body.isAvailable);
  if (req.body?.categoryId !== undefined) {
    const category = await prisma.menuCategory.findFirst({
      where: { id: Number(req.body.categoryId), tenantId: req.auth!.tenantId }
    });
    if (!category) {
      return res.status(404).json({ message: "Category not found." });
    }
    updates.categoryId = Number(req.body.categoryId);
  }

  const updated = await prisma.menuItem.update({ where: { id }, data: updates });
  return res.json(serializeMenuItem(updated));
});

menuRouter.post("/items", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const name = String(req.body?.name ?? "").trim();
  const categoryId = Number(req.body?.categoryId);
  const price = Number(req.body?.price);

  if (!name || Number.isNaN(categoryId) || Number.isNaN(price)) {
    return res.status(400).json({ message: "Name, category, and price are required." });
  }

  const category = await prisma.menuCategory.findFirst({
    where: { id: categoryId, tenantId: req.auth!.tenantId }
  });

  if (!category) {
    return res.status(404).json({ message: "Category not found." });
  }

  const item = await prisma.menuItem.create({
    data: {
      tenantId: req.auth!.tenantId,
      categoryId,
      name,
      description: req.body?.description ? String(req.body.description) : null,
      photoUrl: req.body?.photoUrl ? String(req.body.photoUrl) : null,
      price,
      isAvailable: req.body?.isAvailable ?? true
    }
  });

  return res.status(201).json(serializeMenuItem(item));
});
