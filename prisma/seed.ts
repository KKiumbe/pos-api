import bcrypt from "bcryptjs";
import { OrderItemStatus, OrderStatus, OrderType, PaymentMethod, Role, StockItemType, StockUnit, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type SeedOrderItem = {
  menuItemId: number;
  quantity: number;
  unitPrice: number;
  status?: OrderItemStatus;
};

type SeedPayment = {
  method: PaymentMethod;
  amount: number;
  reference: string;
  paidAt: Date;
};

async function upsertSeedOrder({
  tenantId,
  orderNumber,
  type,
  status,
  createdById,
  tableId,
  deliveryAgentId,
  dispatchSmsRequested = false,
  dispatchSmsSentAt = null,
  customerName = null,
  customerPhone = null,
  deliveryLocation = null,
  deliveryAddress = null,
  inventoryDeducted = false,
  createdAt,
  items,
  payments = []
}: {
  tenantId: number;
  orderNumber: string;
  type: OrderType;
  status: OrderStatus;
  createdById: number;
  tableId?: number | null;
  deliveryAgentId?: number | null;
  dispatchSmsRequested?: boolean;
  dispatchSmsSentAt?: Date | null;
  customerName?: string | null;
  customerPhone?: string | null;
  deliveryLocation?: string | null;
  deliveryAddress?: string | null;
  inventoryDeducted?: boolean;
  createdAt: Date;
  items: SeedOrderItem[];
  payments?: SeedPayment[];
}) {
  const itemData = items.map((item) => ({
    menuItemId: item.menuItemId,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    status: item.status ?? OrderItemStatus.PENDING
  }));

  const order = await prisma.order.upsert({
    where: { tenantId_orderNumber: { tenantId, orderNumber } },
    update: {
      type,
      status,
      tableId: tableId ?? null,
      deliveryAgentId: type === OrderType.TAKEAWAY ? deliveryAgentId ?? null : null,
      dispatchSmsRequested,
      dispatchSmsSentAt,
      customerName,
      customerPhone,
      deliveryLocation,
      deliveryAddress,
      inventoryDeducted,
      createdById,
      createdAt,
      items: {
        deleteMany: {},
        create: itemData
      }
    },
    create: {
      tenantId,
      orderNumber,
      type,
      status,
      tableId: tableId ?? null,
      deliveryAgentId: type === OrderType.TAKEAWAY ? deliveryAgentId ?? null : null,
      dispatchSmsRequested,
      dispatchSmsSentAt,
      customerName,
      customerPhone,
      deliveryLocation,
      deliveryAddress,
      inventoryDeducted,
      createdById,
      createdAt,
      items: {
        create: itemData
      }
    }
  });

  await prisma.payment.deleteMany({ where: { orderId: order.id } });

  for (const payment of payments) {
    const createdPayment = await prisma.payment.create({
      data: {
        tenantId,
        orderId: order.id,
        method: payment.method,
        amount: payment.amount,
        reference: payment.reference,
        paidAt: payment.paidAt
      }
    });

    if (payment.method === PaymentMethod.MPESA) {
      await prisma.mpesaTransaction.upsert({
        where: { checkoutRequestId: `SEED-${payment.reference}` },
        update: {
          tenantId,
          paymentId: createdPayment.id,
          phoneNumber: customerPhone ?? "254700000000",
          amount: payment.amount,
          reference: payment.reference,
          status: "COMPLETED",
          createdAt: payment.paidAt,
          completedAt: payment.paidAt
        },
        create: {
          tenantId,
          paymentId: createdPayment.id,
          checkoutRequestId: `SEED-${payment.reference}`,
          phoneNumber: customerPhone ?? "254700000000",
          amount: payment.amount,
          reference: payment.reference,
          status: "COMPLETED",
          createdAt: payment.paidAt,
          completedAt: payment.paidAt
        }
      });
    }
  }

  return order;
}

async function main() {
  const passwordHash = await bcrypt.hash("Admin@1234", 10);

  const systemTenant = await prisma.tenant.upsert({
    where: { slug: "system" },
    update: {
      name: "TableFlow System"
    },
    create: {
      name: "TableFlow System",
      slug: "system",
      contactEmail: "admin@tableflow.app",
      currency: "KES",
      timezone: "Africa/Nairobi"
    }
  });

  await prisma.user.upsert({
    where: { email: "admin@tableflow.app" },
    update: {},
    create: {
      tenantId: systemTenant.id,
      email: "admin@tableflow.app",
      firstName: "System",
      lastName: "Admin",
      passwordHash,
      role: Role.SUPER_ADMIN
    }
  });

  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-restaurant" },
    update: {},
    create: {
      name: "Demo Restaurant",
      slug: "demo-restaurant",
      address: "Ngong Road, Nairobi",
      phone: "254700123456",
      contactEmail: "ops@demo.tableflow.app",
      logoUrl: "https://placehold.co/160x160?text=Demo",
      brandColor: "#a64b2a",
      currency: "KES",
      timezone: "Africa/Nairobi"
    }
  });

  await prisma.subscriptionPlan.upsert({
    where: { tenantId: tenant.id },
    update: {
      monthlyCharge: 15000,
      billingDay: 5,
      status: "ACTIVE"
    },
    create: {
      tenantId: tenant.id,
      planName: "Restaurant Standard",
      monthlyCharge: 15000,
      billingDay: 5,
      status: "ACTIVE",
      nextBillingDate: new Date("2026-05-05T00:00:00.000Z"),
      notes: "Seeded tenant subscription"
    }
  });

  await prisma.smsConfig.upsert({
    where: { tenantId: tenant.id },
    update: {
      provider: "advanta",
      senderId: "TABLEFLOW",
      username: "demo-rest",
      isActive: false
    },
    create: {
      tenantId: tenant.id,
      provider: "advanta",
      senderId: "TABLEFLOW",
      username: "demo-rest",
      apiKey: "demo-key",
      apiSecret: "demo-secret",
      isActive: false
    }
  });

  await prisma.mpesaConfig.upsert({
    where: { tenantId: tenant.id },
    update: {
      environment: "sandbox",
      shortCode: "174379",
      tillNumber: "522522",
      isActive: false
    },
    create: {
      tenantId: tenant.id,
      environment: "sandbox",
      shortCode: "174379",
      tillNumber: "522522",
      passkey: "demo-passkey",
      consumerKey: "demo-consumer-key",
      consumerSecret: "demo-consumer-secret",
      callbackUrl: "https://demo.tableflow.app/api/mpesa/callback",
      isActive: false
    }
  });

  const users = [
    ["manager@demo.tableflow.app", "Grace", "Manager", Role.MANAGER],
    ["cashier@demo.tableflow.app", "Brian", "Cashier", Role.CASHIER],
    ["kitchen@demo.tableflow.app", "Amina", "Kitchen", Role.KITCHEN],
    ["delivery@demo.tableflow.app", "Kevin", "Delivery", Role.DELIVERY]
  ] as const;

  for (const [email, firstName, lastName, role] of users) {
    await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        tenantId: tenant.id,
        email,
        firstName,
        lastName,
        passwordHash,
        role
      }
    });
  }

  const deliveryAgents = [
    ["John", "Mwangi", "0700111222", "Owns a motorbike and handles Westlands runs."],
    ["Faith", "Achieng", "0712333444", "Usually available for lunchtime CBD pickups."]
  ] as const;

  for (const [firstName, lastName, phone, notes] of deliveryAgents) {
    await prisma.deliveryAgent.upsert({
      where: {
        tenantId_phone: {
          tenantId: tenant.id,
          phone
        }
      },
      update: {
        firstName,
        lastName,
        notes,
        isActive: true
      },
      create: {
        tenantId: tenant.id,
        firstName,
        lastName,
        phone,
        notes
      }
    });
  }

  for (const tableLabel of ["T1", "T2", "T3", "T4", "Patio"]) {
    await prisma.table.upsert({
      where: {
        tenantId_label: {
          tenantId: tenant.id,
          label: tableLabel
        }
      },
      update: {},
      create: {
        tenantId: tenant.id,
        label: tableLabel,
        capacity: tableLabel === "Patio" ? 6 : 4
      }
    });
  }

  const mains = await prisma.menuCategory.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Main Dishes"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Main Dishes",
      sortOrder: 1
    }
  });

  const drinks = await prisma.menuCategory.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Drinks"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Drinks",
      sortOrder: 2
    }
  });

  const ugaliBeef = await prisma.menuItem.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Ugali Beef"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      categoryId: mains.id,
      name: "Ugali Beef",
      description: "Ugali served with wet fry beef.",
      photoUrl: "https://placehold.co/640x420?text=Ugali+Beef",
      price: 650
    }
  });

  const pilau = await prisma.menuItem.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Chicken Pilau"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      categoryId: mains.id,
      name: "Chicken Pilau",
      description: "Pilau rice with spiced chicken.",
      photoUrl: "https://placehold.co/640x420?text=Chicken+Pilau",
      price: 780
    }
  });

  const passionJuice = await prisma.menuItem.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Passion Juice"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      categoryId: drinks.id,
      name: "Passion Juice",
      description: "Fresh chilled passion juice.",
      photoUrl: "https://placehold.co/640x420?text=Passion+Juice",
      price: 220
    }
  });

  const beef = await prisma.stockItem.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Beef"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Beef",
      unit: StockUnit.KILOGRAM,
      quantity: 20,
      reorderLevel: 5
    }
  });

  const maizeFlour = await prisma.stockItem.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Maize Flour"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Maize Flour",
      unit: StockUnit.KILOGRAM,
      quantity: 30,
      reorderLevel: 8
    }
  });

  const chicken = await prisma.stockItem.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Chicken"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Chicken",
      unit: StockUnit.KILOGRAM,
      quantity: 18,
      reorderLevel: 4
    }
  });

  const rice = await prisma.stockItem.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Rice"
      }
    },
    update: {},
    create: {
      tenantId: tenant.id,
      name: "Rice",
      unit: StockUnit.KILOGRAM,
      quantity: 25,
      reorderLevel: 6
    }
  });

  await prisma.stockItem.upsert({
    where: {
      tenantId_name: {
        tenantId: tenant.id,
        name: "Passion Juice Bottles"
      }
    },
    update: {
      type: StockItemType.MENU,
      menuItemId: passionJuice.id,
      unit: StockUnit.BOTTLE,
      quantity: 48,
      reorderLevel: 12
    },
    create: {
      tenantId: tenant.id,
      type: StockItemType.MENU,
      menuItemId: passionJuice.id,
      name: "Passion Juice Bottles",
      unit: StockUnit.BOTTLE,
      quantity: 48,
      reorderLevel: 12
    }
  });

  await prisma.recipe.upsert({
    where: { menuItemId: ugaliBeef.id },
    update: {
      items: {
        deleteMany: {},
        create: [
          { stockItemId: beef.id, quantity: 0.25 },
          { stockItemId: maizeFlour.id, quantity: 0.2 }
        ]
      }
    },
    create: {
      tenantId: tenant.id,
      menuItemId: ugaliBeef.id,
      items: {
        create: [
          { stockItemId: beef.id, quantity: 0.25 },
          { stockItemId: maizeFlour.id, quantity: 0.2 }
        ]
      }
    }
  });

  await prisma.recipe.upsert({
    where: { menuItemId: pilau.id },
    update: {
      items: {
        deleteMany: {},
        create: [
          { stockItemId: chicken.id, quantity: 0.3 },
          { stockItemId: rice.id, quantity: 0.25 }
        ]
      }
    },
    create: {
      tenantId: tenant.id,
      menuItemId: pilau.id,
      items: {
        create: [
          { stockItemId: chicken.id, quantity: 0.3 },
          { stockItemId: rice.id, quantity: 0.25 }
        ]
      }
    }
  });

  const demoCashier = await prisma.user.findUniqueOrThrow({ where: { email: "cashier@demo.tableflow.app" } });
  const demoManager = await prisma.user.findUniqueOrThrow({ where: { email: "manager@demo.tableflow.app" } });
  const demoTableT1 = await prisma.table.findUniqueOrThrow({ where: { tenantId_label: { tenantId: tenant.id, label: "T1" } } });
  const demoTablePatio = await prisma.table.findUniqueOrThrow({ where: { tenantId_label: { tenantId: tenant.id, label: "Patio" } } });
  const demoRider = await prisma.deliveryAgent.findFirstOrThrow({ where: { tenantId: tenant.id, phone: "0700111222" } });

  await upsertSeedOrder({
    tenantId: tenant.id,
    orderNumber: "DIN-0001",
    type: OrderType.DINE_IN,
    status: OrderStatus.OPEN,
    tableId: demoTableT1.id,
    customerName: "Walk-in table",
    customerPhone: "0711000001",
    createdById: demoCashier.id,
    createdAt: new Date("2026-04-21T08:10:00.000Z"),
    items: [
      { menuItemId: ugaliBeef.id, quantity: 2, unitPrice: 650 },
      { menuItemId: passionJuice.id, quantity: 2, unitPrice: 220 }
    ]
  });

  await upsertSeedOrder({
    tenantId: tenant.id,
    orderNumber: "DIN-0002",
    type: OrderType.DINE_IN,
    status: OrderStatus.SENT_TO_KITCHEN,
    tableId: demoTablePatio.id,
    customerName: "Miriam",
    customerPhone: "0711000002",
    createdById: demoCashier.id,
    createdAt: new Date("2026-04-21T08:40:00.000Z"),
    items: [
      { menuItemId: pilau.id, quantity: 1, unitPrice: 780, status: OrderItemStatus.PREPARING },
      { menuItemId: passionJuice.id, quantity: 1, unitPrice: 220, status: OrderItemStatus.READY }
    ]
  });

  await upsertSeedOrder({
    tenantId: tenant.id,
    orderNumber: "TKW-0003",
    type: OrderType.TAKEAWAY,
    status: OrderStatus.READY,
    deliveryAgentId: demoRider.id,
    dispatchSmsRequested: true,
    dispatchSmsSentAt: new Date("2026-04-21T09:03:00.000Z"),
    customerName: "Peter Njoroge",
    customerPhone: "254712345678",
    deliveryLocation: "Westlands Gate B",
    deliveryAddress: "Waiyaki Way, Nairobi",
    createdById: demoManager.id,
    createdAt: new Date("2026-04-21T08:55:00.000Z"),
    items: [
      { menuItemId: ugaliBeef.id, quantity: 1, unitPrice: 650, status: OrderItemStatus.READY },
      { menuItemId: pilau.id, quantity: 1, unitPrice: 780, status: OrderItemStatus.READY }
    ]
  });

  await upsertSeedOrder({
    tenantId: tenant.id,
    orderNumber: "TKW-0004",
    type: OrderType.TAKEAWAY,
    status: OrderStatus.PAID,
    deliveryAgentId: demoRider.id,
    dispatchSmsRequested: true,
    dispatchSmsSentAt: new Date("2026-04-21T09:20:00.000Z"),
    customerName: "Nadia",
    customerPhone: "254700987654",
    deliveryLocation: "Kilimani",
    deliveryAddress: "Kindaruma Road",
    createdById: demoCashier.id,
    createdAt: new Date("2026-04-21T09:10:00.000Z"),
    inventoryDeducted: true,
    items: [
      { menuItemId: pilau.id, quantity: 2, unitPrice: 780, status: OrderItemStatus.READY }
    ],
    payments: [
      {
        method: PaymentMethod.MPESA,
        amount: 1560,
        reference: "MPESA-DEMO-0004",
        paidAt: new Date("2026-04-21T09:25:00.000Z")
      }
    ]
  });

  await prisma.smsMessage.deleteMany({ where: { tenantId: tenant.id, provider: "seed" } });
  await prisma.smsMessage.createMany({
    data: [
      {
        tenantId: tenant.id,
        recipient: demoRider.phone,
        message: "New pickup TKW-0003 at Demo Restaurant for Peter Njoroge for Westlands Gate B.",
        status: "SENT",
        provider: "seed",
        createdAt: new Date("2026-04-21T09:03:00.000Z"),
        sentAt: new Date("2026-04-21T09:03:20.000Z")
      },
      {
        tenantId: tenant.id,
        recipient: "254700987654",
        message: "Payment received for TKW-0004. Thank you for ordering from Demo Restaurant.",
        status: "SENT",
        provider: "seed",
        createdAt: new Date("2026-04-21T09:25:00.000Z"),
        sentAt: new Date("2026-04-21T09:25:10.000Z")
      }
    ]
  });

  // ── Jua Kali Grill — owner's restaurant ──
  const ownerHash = await bcrypt.hash("123", 10);

  const juaKali = await prisma.tenant.upsert({
    where: { slug: "jua-kali-grill" },
    update: {},
    create: {
      name: "Jua Kali Grill",
      slug: "jua-kali-grill",
      address: "Tom Mboya Street, Nairobi",
      phone: "0702550190",
      contactEmail: "owner@juakaligrill.co.ke",
      brandColor: "#2d6a4f",
      currency: "KES",
      timezone: "Africa/Nairobi"
    }
  });

  await prisma.user.upsert({
    where: { email: "0702550190" },
    update: {},
    create: {
      tenantId: juaKali.id,
      email: "0702550190",
      firstName: "Owner",
      lastName: "Manager",
      passwordHash: ownerHash,
      role: Role.MANAGER
    }
  });

  await prisma.user.upsert({
    where: { email: "cashier@juakaligrill.co.ke" },
    update: {},
    create: {
      tenantId: juaKali.id,
      email: "cashier@juakaligrill.co.ke",
      firstName: "Njeri",
      lastName: "Cashier",
      passwordHash: ownerHash,
      role: Role.CASHIER
    }
  });

  await prisma.user.upsert({
    where: { email: "kitchen@juakaligrill.co.ke" },
    update: {},
    create: {
      tenantId: juaKali.id,
      email: "kitchen@juakaligrill.co.ke",
      firstName: "Otieno",
      lastName: "Kitchen",
      passwordHash: ownerHash,
      role: Role.KITCHEN
    }
  });

  await prisma.user.upsert({
    where: { email: "delivery@juakaligrill.co.ke" },
    update: {},
    create: {
      tenantId: juaKali.id,
      email: "delivery@juakaligrill.co.ke",
      firstName: "Wanjiku",
      lastName: "Delivery",
      passwordHash: ownerHash,
      role: Role.DELIVERY
    }
  });

  const juaDeliveryAgent = await prisma.deliveryAgent.upsert({
    where: { tenantId_phone: { tenantId: juaKali.id, phone: "0702550191" } },
    update: {
      firstName: "Sam",
      lastName: "Rider",
      notes: "Primary CBD and Pangani rider.",
      isActive: true
    },
    create: {
      tenantId: juaKali.id,
      firstName: "Sam",
      lastName: "Rider",
      phone: "0702550191",
      notes: "Primary CBD and Pangani rider."
    }
  });

  for (const label of ["T1", "T2", "T3", "Bar", "Terrace"]) {
    await prisma.table.upsert({
      where: { tenantId_label: { tenantId: juaKali.id, label } },
      update: {},
      create: { tenantId: juaKali.id, label, capacity: label === "Terrace" ? 8 : label === "Bar" ? 2 : 4 }
    });
  }

  const grills = await prisma.menuCategory.upsert({
    where: { tenantId_name: { tenantId: juaKali.id, name: "Grills" } },
    update: {},
    create: { tenantId: juaKali.id, name: "Grills", sortOrder: 1 }
  });

  const sides = await prisma.menuCategory.upsert({
    where: { tenantId_name: { tenantId: juaKali.id, name: "Sides" } },
    update: {},
    create: { tenantId: juaKali.id, name: "Sides", sortOrder: 2 }
  });

  const juices = await prisma.menuCategory.upsert({
    where: { tenantId_name: { tenantId: juaKali.id, name: "Drinks" } },
    update: {},
    create: { tenantId: juaKali.id, name: "Drinks", sortOrder: 3 }
  });

  const menuItems = [
    { name: "Nyama Choma", category: grills, price: 1200, description: "Grilled beef ribs, slow-cooked over charcoal.", photoUrl: "https://placehold.co/640x420/2d6a4f/white?text=Nyama+Choma" },
    { name: "Kuku Choma", category: grills, price: 950, description: "Half grilled chicken, marinated in garlic and lemon.", photoUrl: "https://placehold.co/640x420/2d6a4f/white?text=Kuku+Choma" },
    { name: "Tilapia Fry", category: grills, price: 850, description: "Whole tilapia, fried crispy with kachumbari on the side.", photoUrl: "https://placehold.co/640x420/2d6a4f/white?text=Tilapia+Fry" },
    { name: "Chips", category: sides, price: 200, description: "Golden fries, lightly salted.", photoUrl: "https://placehold.co/640x420/2d6a4f/white?text=Chips" },
    { name: "Ugali", category: sides, price: 100, description: "Firm white maize ugali.", photoUrl: "https://placehold.co/640x420/2d6a4f/white?text=Ugali" },
    { name: "Sukuma Wiki", category: sides, price: 120, description: "Sautéed collard greens with onions.", photoUrl: "https://placehold.co/640x420/2d6a4f/white?text=Sukuma+Wiki" },
    { name: "Mango Juice", category: juices, price: 180, description: "Fresh blended Kenyan mango, chilled.", photoUrl: "https://placehold.co/640x420/2d6a4f/white?text=Mango+Juice" },
    { name: "Passion Juice", category: juices, price: 160, description: "Fresh passion fruit juice.", photoUrl: "https://placehold.co/640x420/2d6a4f/white?text=Passion+Juice" },
    { name: "Dawa Cocktail", category: juices, price: 350, description: "Vodka, honey, lime and crushed ice.", photoUrl: "https://placehold.co/640x420/2d6a4f/white?text=Dawa" }
  ];

  for (const item of menuItems) {
    await prisma.menuItem.upsert({
      where: { tenantId_name: { tenantId: juaKali.id, name: item.name } },
      update: {},
      create: {
        tenantId: juaKali.id,
        categoryId: item.category.id,
        name: item.name,
        description: item.description,
        photoUrl: item.photoUrl,
        price: item.price
      }
    });
  }

  const stockItems = [
    { name: "Beef", unit: StockUnit.KILOGRAM, quantity: 25, reorderLevel: 6 },
    { name: "Chicken", unit: StockUnit.KILOGRAM, quantity: 20, reorderLevel: 5 },
    { name: "Tilapia", unit: StockUnit.KILOGRAM, quantity: 15, reorderLevel: 4 },
    { name: "Potatoes", unit: StockUnit.KILOGRAM, quantity: 30, reorderLevel: 8 },
    { name: "Maize Flour", unit: StockUnit.KILOGRAM, quantity: 20, reorderLevel: 5 },
    { name: "Sukuma Wiki", unit: StockUnit.PIECE, quantity: 40, reorderLevel: 10 },
    { name: "Mango", unit: StockUnit.KILOGRAM, quantity: 18, reorderLevel: 5 },
    { name: "Passion Fruit", unit: StockUnit.KILOGRAM, quantity: 12, reorderLevel: 4 }
  ];

  for (const stock of stockItems) {
    await prisma.stockItem.upsert({
      where: { tenantId_name: { tenantId: juaKali.id, name: stock.name } },
      update: {
        unit: stock.unit,
        quantity: stock.quantity,
        reorderLevel: stock.reorderLevel
      },
      create: { tenantId: juaKali.id, ...stock }
    });
  }

  const juaMenu = await prisma.menuItem.findMany({ where: { tenantId: juaKali.id } });
  const juaStock = await prisma.stockItem.findMany({ where: { tenantId: juaKali.id } });
  const juaMenuItem = (name: string) => {
    const item = juaMenu.find((entry) => entry.name === name);
    if (!item) throw new Error(`Missing Jua Kali menu item ${name}`);
    return item;
  };
  const juaStockItem = (name: string) => {
    const item = juaStock.find((entry) => entry.name === name);
    if (!item) throw new Error(`Missing Jua Kali stock item ${name}`);
    return item;
  };

  const nyamaChoma = juaMenuItem("Nyama Choma");
  const kukuChoma = juaMenuItem("Kuku Choma");
  const chips = juaMenuItem("Chips");
  const ugaliSide = juaMenuItem("Ugali");
  const mangoJuice = juaMenuItem("Mango Juice");
  const passionSide = juaMenuItem("Passion Juice");
  const dawaCocktail = juaMenuItem("Dawa Cocktail");

  await prisma.stockItem.upsert({
    where: { tenantId_name: { tenantId: juaKali.id, name: "Dawa Cocktail Servings" } },
    update: {
      type: StockItemType.MENU,
      menuItemId: dawaCocktail.id,
      unit: StockUnit.PIECE,
      quantity: 25,
      reorderLevel: 5
    },
    create: {
      tenantId: juaKali.id,
      type: StockItemType.MENU,
      menuItemId: dawaCocktail.id,
      name: "Dawa Cocktail Servings",
      unit: StockUnit.PIECE,
      quantity: 25,
      reorderLevel: 5
    }
  });

  await prisma.recipe.upsert({
    where: { menuItemId: nyamaChoma.id },
    update: {
      items: {
        deleteMany: {},
        create: [
          { stockItemId: juaStockItem("Beef").id, quantity: 0.5 }
        ]
      }
    },
    create: {
      tenantId: juaKali.id,
      menuItemId: nyamaChoma.id,
      items: { create: [{ stockItemId: juaStockItem("Beef").id, quantity: 0.5 }] }
    }
  });

  await prisma.recipe.upsert({
    where: { menuItemId: kukuChoma.id },
    update: {
      items: {
        deleteMany: {},
        create: [
          { stockItemId: juaStockItem("Chicken").id, quantity: 0.45 }
        ]
      }
    },
    create: {
      tenantId: juaKali.id,
      menuItemId: kukuChoma.id,
      items: { create: [{ stockItemId: juaStockItem("Chicken").id, quantity: 0.45 }] }
    }
  });

  const juaOwner = await prisma.user.findUniqueOrThrow({ where: { email: "0702550190" } });
  const juaCashier = await prisma.user.findUniqueOrThrow({ where: { email: "cashier@juakaligrill.co.ke" } });
  const juaTableT2 = await prisma.table.findUniqueOrThrow({ where: { tenantId_label: { tenantId: juaKali.id, label: "T2" } } });
  const juaTableTerrace = await prisma.table.findUniqueOrThrow({ where: { tenantId_label: { tenantId: juaKali.id, label: "Terrace" } } });

  await upsertSeedOrder({
    tenantId: juaKali.id,
    orderNumber: "DIN-0001",
    type: OrderType.DINE_IN,
    status: OrderStatus.SENT_TO_KITCHEN,
    tableId: juaTableT2.id,
    customerName: "Table T2",
    createdById: juaCashier.id,
    createdAt: new Date("2026-04-21T10:05:00.000Z"),
    items: [
      { menuItemId: nyamaChoma.id, quantity: 1, unitPrice: 1200, status: OrderItemStatus.PREPARING },
      { menuItemId: ugaliSide.id, quantity: 2, unitPrice: 100, status: OrderItemStatus.READY },
      { menuItemId: passionSide.id, quantity: 2, unitPrice: 160, status: OrderItemStatus.READY }
    ]
  });

  await upsertSeedOrder({
    tenantId: juaKali.id,
    orderNumber: "TKW-0002",
    type: OrderType.TAKEAWAY,
    status: OrderStatus.READY,
    deliveryAgentId: juaDeliveryAgent.id,
    dispatchSmsRequested: true,
    dispatchSmsSentAt: new Date("2026-04-21T10:22:00.000Z"),
    customerName: "Mwikali",
    customerPhone: "254711222333",
    deliveryLocation: "Pangani",
    deliveryAddress: "Third Parklands Avenue",
    createdById: juaOwner.id,
    createdAt: new Date("2026-04-21T10:15:00.000Z"),
    items: [
      { menuItemId: kukuChoma.id, quantity: 1, unitPrice: 950, status: OrderItemStatus.READY },
      { menuItemId: chips.id, quantity: 1, unitPrice: 200, status: OrderItemStatus.READY },
      { menuItemId: mangoJuice.id, quantity: 1, unitPrice: 180, status: OrderItemStatus.READY }
    ]
  });

  await upsertSeedOrder({
    tenantId: juaKali.id,
    orderNumber: "DIN-0003",
    type: OrderType.DINE_IN,
    status: OrderStatus.PAID,
    tableId: juaTableTerrace.id,
    customerName: "Terrace group",
    createdById: juaCashier.id,
    createdAt: new Date("2026-04-21T10:30:00.000Z"),
    inventoryDeducted: true,
    items: [
      { menuItemId: nyamaChoma.id, quantity: 2, unitPrice: 1200, status: OrderItemStatus.READY },
      { menuItemId: chips.id, quantity: 3, unitPrice: 200, status: OrderItemStatus.READY }
    ],
    payments: [
      {
        method: PaymentMethod.CASH,
        amount: 3000,
        reference: "CASH-JUA-0003",
        paidAt: new Date("2026-04-21T10:50:00.000Z")
      }
    ]
  });

  await prisma.smsMessage.deleteMany({ where: { tenantId: juaKali.id, provider: "seed" } });
  await prisma.smsMessage.createMany({
    data: [
      {
        tenantId: juaKali.id,
        recipient: juaDeliveryAgent.phone,
        message: "New pickup TKW-0002 at Jua Kali Grill for Mwikali for Pangani.",
        status: "SENT",
        provider: "seed",
        createdAt: new Date("2026-04-21T10:22:00.000Z"),
        sentAt: new Date("2026-04-21T10:22:15.000Z")
      }
    ]
  });

  // ── Super admin via phone ──
  const phoneAdminHash = await bcrypt.hash("123", 10);
  await prisma.user.upsert({
    where: { email: "0722230603" },
    update: { passwordHash: phoneAdminHash },
    create: {
      tenantId: systemTenant.id,
      email: "0722230603",
      firstName: "Super",
      lastName: "Admin",
      passwordHash: phoneAdminHash,
      role: Role.SUPER_ADMIN
    }
  });

  console.log("Seed complete");
  console.log("Super Admin: admin@tableflow.app / Admin@1234");
  console.log("Super Admin (phone): 0722230603 / 123");
  console.log("Manager: manager@demo.tableflow.app / Admin@1234");
  console.log("Cashier: cashier@demo.tableflow.app / Admin@1234");
  console.log("Kitchen: kitchen@demo.tableflow.app / Admin@1234");
  console.log("Delivery: delivery@demo.tableflow.app / Admin@1234");
  console.log("Owner (Jua Kali Grill): 0702550190 / 123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
