import bcrypt from "bcryptjs";
import { Router } from "express";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";
import { serializeUser } from "../../utils/serializers.js";

export const adminRouter = Router();

function serializeTenantAdminView(tenant: any) {
  return {
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
    createdAt: tenant.createdAt,
    updatedAt: tenant.updatedAt,
    manager: tenant.users[0] ? serializeUser(tenant.users[0]) : null,
    subscription: tenant.subscription
      ? {
          id: tenant.subscription.id,
          planName: tenant.subscription.planName,
          monthlyCharge: Number(tenant.subscription.monthlyCharge),
          billingDay: tenant.subscription.billingDay,
          status: tenant.subscription.status,
          nextBillingDate: tenant.subscription.nextBillingDate,
          notes: tenant.subscription.notes
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
  };
}

function serializePlatformUser(user: any) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    tenant: user.tenant
      ? {
          id: user.tenant.id,
          name: user.tenant.name,
          slug: user.tenant.slug,
          isActive: user.tenant.isActive
        }
      : null
  };
}

adminRouter.use(authenticate);
adminRouter.use(requireRole(["SUPER_ADMIN"]));

adminRouter.get("/restaurants", async (_req: AuthenticatedRequest, res) => {
  const tenants = await prisma.tenant.findMany({
    include: {
      users: {
        where: { role: "MANAGER" },
        take: 1,
        orderBy: { createdAt: "asc" }
      },
      subscription: true,
      smsConfig: true,
      mpesaConfig: true
    },
    orderBy: { createdAt: "desc" }
  });

  return res.json(tenants.map(serializeTenantAdminView));
});

adminRouter.get("/users", async (_req: AuthenticatedRequest, res) => {
  const users = await prisma.user.findMany({
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true
        }
      }
    },
    orderBy: [{ role: "asc" }, { createdAt: "desc" }]
  });

  return res.json(users.map(serializePlatformUser));
});

adminRouter.post("/restaurants", async (req: AuthenticatedRequest, res) => {
  const name = String(req.body?.name ?? "").trim();
  const slug = String(req.body?.slug ?? "").trim().toLowerCase();
  const address = req.body?.address ? String(req.body.address).trim() : null;
  const phone = req.body?.phone ? String(req.body.phone).trim() : null;
  const contactEmail = req.body?.contactEmail ? String(req.body.contactEmail).trim().toLowerCase() : null;
  const logoUrl = req.body?.logoUrl ? String(req.body.logoUrl).trim() : null;
  const brandColor = req.body?.brandColor ? String(req.body.brandColor).trim() : "#a64b2a";
  const managerEmail = String(req.body?.managerEmail ?? "").trim().toLowerCase();
  const managerPassword = String(req.body?.managerPassword ?? "").trim();
  const managerFirstName = String(req.body?.managerFirstName ?? "").trim();
  const managerLastName = String(req.body?.managerLastName ?? "").trim();
  const monthlyCharge = Number(req.body?.monthlyCharge ?? 0);
  const billingDay = Number(req.body?.billingDay ?? 1);

  if (!name || !slug || !managerEmail || !managerPassword || !managerFirstName || !managerLastName) {
    return res.status(400).json({ message: "Restaurant and manager details are required." });
  }

  const passwordHash = await bcrypt.hash(managerPassword, 10);

  const created = await prisma.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name,
        slug,
        address,
        phone,
        contactEmail,
        logoUrl,
        brandColor,
        currency: "KES",
        timezone: "Africa/Nairobi"
      }
    });

    await tx.user.create({
      data: {
        tenantId: tenant.id,
        firstName: managerFirstName,
        lastName: managerLastName,
        email: managerEmail,
        passwordHash,
        role: "MANAGER"
      }
    });

    await tx.subscriptionPlan.create({
      data: {
        tenantId: tenant.id,
        planName: String(req.body?.planName ?? "Standard"),
        monthlyCharge,
        billingDay,
        status: String(req.body?.subscriptionStatus ?? "ACTIVE"),
        nextBillingDate: req.body?.nextBillingDate ? new Date(String(req.body.nextBillingDate)) : null,
        notes: req.body?.subscriptionNotes ? String(req.body.subscriptionNotes) : null
      }
    });

    await tx.smsConfig.create({
      data: {
        tenantId: tenant.id,
        provider: String(req.body?.smsProvider ?? "mock-sms"),
        senderId: req.body?.smsSenderId ? String(req.body.smsSenderId) : null,
        apiKey: req.body?.smsApiKey ? String(req.body.smsApiKey) : null,
        apiSecret: req.body?.smsApiSecret ? String(req.body.smsApiSecret) : null,
        username: req.body?.smsUsername ? String(req.body.smsUsername) : null,
        isActive: Boolean(req.body?.smsIsActive ?? false)
      }
    });

    await tx.mpesaConfig.create({
      data: {
        tenantId: tenant.id,
        environment: String(req.body?.mpesaEnvironment ?? "sandbox"),
        shortCode: req.body?.mpesaShortCode ? String(req.body.mpesaShortCode) : null,
        tillNumber: req.body?.mpesaTillNumber ? String(req.body.mpesaTillNumber) : null,
        passkey: req.body?.mpesaPasskey ? String(req.body.mpesaPasskey) : null,
        consumerKey: req.body?.mpesaConsumerKey ? String(req.body.mpesaConsumerKey) : null,
        consumerSecret: req.body?.mpesaConsumerSecret ? String(req.body.mpesaConsumerSecret) : null,
        callbackUrl: req.body?.mpesaCallbackUrl ? String(req.body.mpesaCallbackUrl) : null,
        isActive: Boolean(req.body?.mpesaIsActive ?? false)
      }
    });

    return tx.tenant.findUniqueOrThrow({
      where: { id: tenant.id },
      include: {
        users: { where: { role: "MANAGER" }, take: 1 },
        subscription: true,
        smsConfig: true,
        mpesaConfig: true
      }
    });
  });

  return res.status(201).json(serializeTenantAdminView(created));
});

adminRouter.patch("/restaurants/:id/general", async (req: AuthenticatedRequest, res) => {
  const tenantId = Number(req.params.id);
  const tenant = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      name: req.body?.name,
      slug: req.body?.slug,
      address: req.body?.address,
      phone: req.body?.phone,
      contactEmail: req.body?.contactEmail,
      logoUrl: req.body?.logoUrl,
      brandColor: req.body?.brandColor,
      isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined
    },
    include: {
      users: { where: { role: "MANAGER" }, take: 1 },
      subscription: true,
      smsConfig: true,
      mpesaConfig: true
    }
  });

  return res.json(serializeTenantAdminView(tenant));
});

adminRouter.patch("/restaurants/:id/subscription", async (req: AuthenticatedRequest, res) => {
  const tenantId = Number(req.params.id);
  const subscription = await prisma.subscriptionPlan.upsert({
    where: { tenantId },
    create: {
      tenantId,
      planName: String(req.body?.planName ?? "Standard"),
      monthlyCharge: Number(req.body?.monthlyCharge ?? 0),
      billingDay: Number(req.body?.billingDay ?? 1),
      status: String(req.body?.status ?? "ACTIVE"),
      nextBillingDate: req.body?.nextBillingDate ? new Date(String(req.body.nextBillingDate)) : null,
      notes: req.body?.notes ? String(req.body.notes) : null
    },
    update: {
      planName: req.body?.planName,
      monthlyCharge: req.body?.monthlyCharge,
      billingDay: req.body?.billingDay,
      status: req.body?.status,
      nextBillingDate: req.body?.nextBillingDate ? new Date(String(req.body.nextBillingDate)) : null,
      notes: req.body?.notes
    }
  });

  return res.json({
    ...subscription,
    monthlyCharge: Number(subscription.monthlyCharge)
  });
});

adminRouter.put("/restaurants/:id/sms-config", async (req: AuthenticatedRequest, res) => {
  const tenantId = Number(req.params.id);
  const config = await prisma.smsConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      provider: String(req.body?.provider ?? "mock-sms"),
      senderId: req.body?.senderId ? String(req.body.senderId) : null,
      apiKey: req.body?.apiKey ? String(req.body.apiKey) : null,
      apiSecret: req.body?.apiSecret ? String(req.body.apiSecret) : null,
      username: req.body?.username ? String(req.body.username) : null,
      isActive: Boolean(req.body?.isActive ?? false)
    },
    update: {
      provider: req.body?.provider,
      senderId: req.body?.senderId,
      apiKey: req.body?.apiKey,
      apiSecret: req.body?.apiSecret,
      username: req.body?.username,
      isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined
    }
  });

  return res.json(config);
});

adminRouter.put("/restaurants/:id/mpesa-config", async (req: AuthenticatedRequest, res) => {
  const tenantId = Number(req.params.id);
  const config = await prisma.mpesaConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      environment: String(req.body?.environment ?? "sandbox"),
      shortCode: req.body?.shortCode ? String(req.body.shortCode) : null,
      tillNumber: req.body?.tillNumber ? String(req.body.tillNumber) : null,
      passkey: req.body?.passkey ? String(req.body.passkey) : null,
      consumerKey: req.body?.consumerKey ? String(req.body.consumerKey) : null,
      consumerSecret: req.body?.consumerSecret ? String(req.body.consumerSecret) : null,
      callbackUrl: req.body?.callbackUrl ? String(req.body.callbackUrl) : null,
      isActive: Boolean(req.body?.isActive ?? false)
    },
    update: {
      environment: req.body?.environment,
      shortCode: req.body?.shortCode,
      tillNumber: req.body?.tillNumber,
      passkey: req.body?.passkey,
      consumerKey: req.body?.consumerKey,
      consumerSecret: req.body?.consumerSecret,
      callbackUrl: req.body?.callbackUrl,
      isActive: typeof req.body?.isActive === "boolean" ? req.body.isActive : undefined
    }
  });

  return res.json({
    ...config,
    consumerSecret: config.consumerSecret ? "••••••••" : null,
    passkey: config.passkey ? "••••••••" : null
  });
});

adminRouter.patch("/users/:id/status", async (req: AuthenticatedRequest, res) => {
  const userId = Number(req.params.id);
  const isActive = Boolean(req.body?.isActive);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive },
    include: {
      tenant: {
        select: {
          id: true,
          name: true,
          slug: true,
          isActive: true
        }
      }
    }
  });

  return res.json(serializePlatformUser(updated));
});
