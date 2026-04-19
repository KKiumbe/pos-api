import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";

export const tenantRouter = Router();

tenantRouter.use(authenticate);

tenantRouter.get("/profile", requireRole(["SUPER_ADMIN", "MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.auth!.tenantId },
    include: {
      subscription: true,
      smsConfig: true,
      mpesaConfig: true
    }
  });

  if (!tenant) {
    return res.status(404).json({ message: "Tenant not found." });
  }

  return res.json({
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    address: tenant.address,
    phone: tenant.phone,
    contactEmail: tenant.contactEmail,
    logoUrl: tenant.logoUrl,
    brandColor: tenant.brandColor,
    currency: tenant.currency,
    timezone: tenant.timezone,
    isActive: tenant.isActive,
    subscription: tenant.subscription
      ? {
          ...tenant.subscription,
          monthlyCharge: Number(tenant.subscription.monthlyCharge)
        }
      : null,
    smsConfig: tenant.smsConfig,
    mpesaConfig: tenant.mpesaConfig
      ? {
          ...tenant.mpesaConfig,
          consumerSecret: tenant.mpesaConfig.consumerSecret ? "••••••••" : null,
          passkey: tenant.mpesaConfig.passkey ? "••••••••" : null
        }
      : null
  });
});

tenantRouter.patch("/profile", requireRole(["MANAGER"]), async (req: AuthenticatedRequest, res) => {
  const tenant = await prisma.tenant.update({
    where: { id: req.auth!.tenantId },
    data: {
      name: req.body?.name,
      address: req.body?.address,
      phone: req.body?.phone,
      contactEmail: req.body?.contactEmail,
      logoUrl: req.body?.logoUrl,
      brandColor: req.body?.brandColor
    }
  });

  return res.json(tenant);
});
