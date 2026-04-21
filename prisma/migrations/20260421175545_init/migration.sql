-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN', 'DELIVERY');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('DINE_IN', 'TAKEAWAY');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'SENT_TO_KITCHEN', 'PARTIALLY_READY', 'READY', 'PAID', 'VOIDED');

-- CreateEnum
CREATE TYPE "OrderItemStatus" AS ENUM ('PENDING', 'PREPARING', 'READY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'MPESA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "StockItemType" AS ENUM ('MENU', 'CONSUMABLE');

-- CreateEnum
CREATE TYPE "StockUnit" AS ENUM ('KILOGRAM', 'GRAM', 'LITER', 'MILLILITER', 'CARTON', 'SLICE', 'PIECE', 'BOTTLE', 'PACKET');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "contactEmail" TEXT,
    "logoUrl" TEXT,
    "brandColor" TEXT DEFAULT '#a64b2a',
    "currency" TEXT NOT NULL DEFAULT 'KES',
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Nairobi',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetOtp" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "otpHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetOtp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Table" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Table_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuCategory" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "photoUrl" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "type" "OrderType" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "inventoryDeducted" BOOLEAN NOT NULL DEFAULT false,
    "tableId" INTEGER,
    "deliveryAgentId" INTEGER,
    "dispatchSmsRequested" BOOLEAN NOT NULL DEFAULT false,
    "dispatchSmsSentAt" TIMESTAMP(3),
    "customerName" TEXT,
    "customerPhone" TEXT,
    "deliveryLocation" TEXT,
    "deliveryAddress" TEXT,
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAgent" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "menuItemId" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "status" "OrderItemStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "orderId" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockItem" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "menuItemId" INTEGER,
    "type" "StockItemType" NOT NULL DEFAULT 'CONSUMABLE',
    "name" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "reorderLevel" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "menuItemId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeItem" (
    "id" SERIAL NOT NULL,
    "recipeId" INTEGER NOT NULL,
    "stockItemId" INTEGER NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" "StockUnit" NOT NULL DEFAULT 'KILOGRAM',

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsMessage" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL DEFAULT 'mock-sms',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpesaTransaction" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "paymentId" INTEGER,
    "checkoutRequestId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "reference" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MpesaTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmsConfig" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock-sms',
    "senderId" TEXT,
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "username" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MpesaConfig" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "environment" TEXT NOT NULL DEFAULT 'sandbox',
    "shortCode" TEXT,
    "tillNumber" TEXT,
    "passkey" TEXT,
    "consumerKey" TEXT,
    "consumerSecret" TEXT,
    "callbackUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MpesaConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" SERIAL NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "planName" TEXT NOT NULL DEFAULT 'Standard',
    "monthlyCharge" DECIMAL(10,2) NOT NULL,
    "billingDay" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextBillingDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE INDEX "PasswordResetOtp_userId_idx" ON "PasswordResetOtp"("userId");

-- CreateIndex
CREATE INDEX "Table_tenantId_idx" ON "Table"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Table_tenantId_label_key" ON "Table"("tenantId", "label");

-- CreateIndex
CREATE INDEX "MenuCategory_tenantId_idx" ON "MenuCategory"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuCategory_tenantId_name_key" ON "MenuCategory"("tenantId", "name");

-- CreateIndex
CREATE INDEX "MenuItem_tenantId_idx" ON "MenuItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_tenantId_name_key" ON "MenuItem"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Order_tenantId_deliveryAgentId_idx" ON "Order"("tenantId", "deliveryAgentId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_orderNumber_key" ON "Order"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "DeliveryAgent_tenantId_isActive_idx" ON "DeliveryAgent"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryAgent_tenantId_phone_key" ON "DeliveryAgent"("tenantId", "phone");

-- CreateIndex
CREATE INDEX "Payment_tenantId_idx" ON "Payment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_menuItemId_key" ON "StockItem"("menuItemId");

-- CreateIndex
CREATE INDEX "StockItem_tenantId_idx" ON "StockItem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockItem_tenantId_name_key" ON "StockItem"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_menuItemId_key" ON "Recipe"("menuItemId");

-- CreateIndex
CREATE INDEX "Recipe_tenantId_idx" ON "Recipe"("tenantId");

-- CreateIndex
CREATE INDEX "SmsMessage_tenantId_createdAt_idx" ON "SmsMessage"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaTransaction_checkoutRequestId_key" ON "MpesaTransaction"("checkoutRequestId");

-- CreateIndex
CREATE INDEX "MpesaTransaction_tenantId_createdAt_idx" ON "MpesaTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "SmsConfig_tenantId_key" ON "SmsConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MpesaConfig_tenantId_key" ON "MpesaConfig"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_tenantId_key" ON "SubscriptionPlan"("tenantId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetOtp" ADD CONSTRAINT "PasswordResetOtp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuCategory" ADD CONSTRAINT "MenuCategory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MenuCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "Table"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryAgentId_fkey" FOREIGN KEY ("deliveryAgentId") REFERENCES "DeliveryAgent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAgent" ADD CONSTRAINT "DeliveryAgent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockItem" ADD CONSTRAINT "StockItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "StockItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpesaTransaction" ADD CONSTRAINT "MpesaTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpesaTransaction" ADD CONSTRAINT "MpesaTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsConfig" ADD CONSTRAINT "SmsConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MpesaConfig" ADD CONSTRAINT "MpesaConfig_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionPlan" ADD CONSTRAINT "SubscriptionPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
