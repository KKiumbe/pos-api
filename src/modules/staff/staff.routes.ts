import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { serializeUser } from "../../utils/serializers.js";

export const staffRouter = Router();

staffRouter.use(authenticate);

staffRouter.get("/", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const users = await prisma.user.findMany({
    where: { tenantId: req.auth!.tenantId },
    orderBy: [{ role: "asc" }, { firstName: "asc" }]
  });

  return res.json(users.map(serializeUser));
});

staffRouter.post("/", requireRole(["MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const firstName = String(req.body?.firstName ?? "").trim();
  const lastName = String(req.body?.lastName ?? "").trim();
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  const password = String(req.body?.password ?? "").trim();
  const role = String(req.body?.role ?? "") as Role;

  if (!firstName || !lastName || !email || !password || !Object.values(Role).includes(role)) {
    return res.status(400).json({ message: "First name, last name, email, password, and role are required." });
  }

  if (role === Role.SUPER_ADMIN) {
    return res.status(403).json({ message: "Tenant managers cannot create super admins." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      tenantId: req.auth!.tenantId,
      firstName,
      lastName,
      email,
      passwordHash,
      role
    }
  });

  return res.status(201).json(serializeUser(user));
});

staffRouter.patch("/:id", requireRole(["MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const userId = Number(req.params.id);
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: req.auth!.tenantId }
  });

  if (!user) {
    return res.status(404).json({ message: "Staff member not found." });
  }

  const nextRole = req.body?.role ? (String(req.body.role) as Role) : undefined;
  if (nextRole === Role.SUPER_ADMIN) {
    return res.status(403).json({ message: "Tenant managers cannot assign super admin role." });
  }

  const data: Record<string, unknown> = {
    firstName: req.body?.firstName,
    lastName: req.body?.lastName,
    email: req.body?.email ? String(req.body.email).trim().toLowerCase() : undefined,
    role: nextRole,
    isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined
  };

  if (req.body?.password) {
    data.passwordHash = await bcrypt.hash(String(req.body.password), 10);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data
  });

  return res.json(serializeUser(updated));
});
