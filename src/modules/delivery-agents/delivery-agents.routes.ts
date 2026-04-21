import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { serializeDeliveryAgent } from "../../utils/serializers.js";

export const deliveryAgentsRouter = Router();

deliveryAgentsRouter.use(authenticate);

deliveryAgentsRouter.get("/", requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER"]), async (req: AuthenticatedRequest, res) => {
  const activeOnly = req.query.activeOnly === "true";
  const agents = await prisma.deliveryAgent.findMany({
    where: {
      tenantId: req.auth!.tenantId,
      ...(activeOnly ? { isActive: true } : {})
    },
    orderBy: [{ isActive: "desc" }, { firstName: "asc" }, { lastName: "asc" }]
  });

  return res.json(agents.map(serializeDeliveryAgent));
});

deliveryAgentsRouter.post("/", requireRole(["MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const firstName = String(req.body?.firstName ?? "").trim();
  const lastName = String(req.body?.lastName ?? "").trim();
  const phone = String(req.body?.phone ?? "").trim();
  const notes = req.body?.notes ? String(req.body.notes).trim() : null;

  if (!firstName || !lastName || !phone) {
    return res.status(400).json({ message: "First name, last name, and phone are required." });
  }

  const existing = await prisma.deliveryAgent.findFirst({
    where: {
      tenantId: req.auth!.tenantId,
      phone
    }
  });

  if (existing) {
    return res.status(409).json({ message: "A delivery profile with that phone already exists." });
  }

  const agent = await prisma.deliveryAgent.create({
    data: {
      tenantId: req.auth!.tenantId,
      firstName,
      lastName,
      phone,
      notes
    }
  });

  return res.status(201).json(serializeDeliveryAgent(agent));
});

deliveryAgentsRouter.patch("/:id", requireRole(["MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const agentId = Number(req.params.id);
  const agent = await prisma.deliveryAgent.findFirst({
    where: { id: agentId, tenantId: req.auth!.tenantId }
  });

  if (!agent) {
    return res.status(404).json({ message: "Delivery profile not found." });
  }

  const phone = req.body?.phone ? String(req.body.phone).trim() : undefined;
  if (phone && phone !== agent.phone) {
    const existing = await prisma.deliveryAgent.findFirst({
      where: {
        tenantId: req.auth!.tenantId,
        phone,
        id: { not: agent.id }
      }
    });

    if (existing) {
      return res.status(409).json({ message: "A delivery profile with that phone already exists." });
    }
  }

  const updated = await prisma.deliveryAgent.update({
    where: { id: agent.id },
    data: {
      firstName: req.body?.firstName ? String(req.body.firstName).trim() : undefined,
      lastName: req.body?.lastName ? String(req.body.lastName).trim() : undefined,
      phone,
      notes: req.body?.notes !== undefined ? (req.body.notes ? String(req.body.notes).trim() : null) : undefined,
      isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined
    }
  });

  return res.json(serializeDeliveryAgent(updated));
});
