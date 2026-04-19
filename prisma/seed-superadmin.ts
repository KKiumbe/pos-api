import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Ensure system tenant exists
  const systemTenant = await prisma.tenant.upsert({
    where: { slug: "system" },
    update: {},
    create: {
      name: "TableFlow System",
      slug: "system",
      contactEmail: "admin@tableflow.app",
      currency: "KES",
      timezone: "Africa/Nairobi"
    }
  });

  const passwordHash = await bcrypt.hash("1234567", 10);

  const user = await prisma.user.upsert({
    where: { email: "kevoqmbe@gmail.com" },
    update: { passwordHash, role: Role.SUPER_ADMIN, isActive: true },
    create: {
      tenantId: systemTenant.id,
      email: "kevoqmbe@gmail.com",
      firstName: "Kevin",
      lastName: "Admin",
      passwordHash,
      role: Role.SUPER_ADMIN
    }
  });

  console.log(`Super admin seeded: ${user.email} (id=${user.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
