import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

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

  await prisma.menuItem.upsert({
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
      unit: "kg",
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
      unit: "kg",
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
      unit: "kg",
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
      unit: "kg",
      quantity: 25,
      reorderLevel: 6
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
    { name: "Beef", unit: "kg", quantity: 25, reorderLevel: 6 },
    { name: "Chicken", unit: "kg", quantity: 20, reorderLevel: 5 },
    { name: "Tilapia", unit: "kg", quantity: 15, reorderLevel: 4 },
    { name: "Potatoes", unit: "kg", quantity: 30, reorderLevel: 8 },
    { name: "Maize Flour", unit: "kg", quantity: 20, reorderLevel: 5 },
    { name: "Sukuma Wiki", unit: "bunch", quantity: 40, reorderLevel: 10 },
    { name: "Mango", unit: "kg", quantity: 18, reorderLevel: 5 },
    { name: "Passion Fruit", unit: "kg", quantity: 12, reorderLevel: 4 }
  ];

  for (const stock of stockItems) {
    await prisma.stockItem.upsert({
      where: { tenantId_name: { tenantId: juaKali.id, name: stock.name } },
      update: {},
      create: { tenantId: juaKali.id, ...stock }
    });
  }

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
