import { OrderStatus, OrderType, Prisma, Role } from "@prisma/client";

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  if (value == null) {
    return null;
  }

  return Number(value);
}

export function serializeUser(user: {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  tenantId: number;
  isActive: boolean;
}) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    tenantId: user.tenantId,
    isActive: user.isActive
  };
}

export function serializeDeliveryAgent(agent: {
  id: number;
  tenantId: number;
  firstName: string;
  lastName: string;
  phone: string;
  notes: string | null;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: agent.id,
    tenantId: agent.tenantId,
    firstName: agent.firstName,
    lastName: agent.lastName,
    phone: agent.phone,
    notes: agent.notes,
    isActive: agent.isActive,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt
  };
}

export function serializeMenuItem(item: any) {
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    photoUrl: item.photoUrl,
    price: toNumber(item.price),
    isAvailable: item.isAvailable,
    categoryId: item.categoryId,
    tenantId: item.tenantId
  };
}

export function serializeStockItem(item: any) {
  return {
    id: item.id,
    type: item.type,
    menuItemId: item.menuItemId ?? null,
    menuItem: item.menuItem
      ? {
          id: item.menuItem.id,
          name: item.menuItem.name
        }
      : null,
    name: item.name,
    unit: item.unit,
    quantity: toNumber(item.quantity),
    reorderLevel: toNumber(item.reorderLevel),
    lowStock: Number(item.quantity) <= Number(item.reorderLevel)
  };
}

export function serializeOrder(order: any) {
  const items = order.items.map((item: any) => ({
    id: item.id,
    quantity: item.quantity,
    unitPrice: toNumber(item.unitPrice),
    notes: item.notes,
    status: item.status,
    menuItem: item.menuItem,
    lineTotal: Number(item.unitPrice) * item.quantity
  }));

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    status: order.status,
    inventoryDeducted: order.inventoryDeducted,
    table: order.table ?? null,
    tableId: order.tableId,
    deliveryAgentId: order.deliveryAgentId ?? null,
    deliveryAgent: order.deliveryAgent
      ? serializeDeliveryAgent(order.deliveryAgent)
      : null,
    dispatchSmsRequested: Boolean(order.dispatchSmsRequested),
    dispatchSmsSentAt: order.dispatchSmsSentAt ?? null,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    deliveryLocation: order.deliveryLocation,
    deliveryAddress: order.deliveryAddress,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    createdBy: order.createdBy ?? null,
    items,
    payments:
      order.payments?.map((payment: any) => ({
        id: payment.id,
        method: payment.method,
        amount: toNumber(payment.amount),
        status: payment.status,
        reference: payment.reference,
        paidAt: payment.paidAt
      })) ?? [],
    totals: {
      subtotal: items.reduce((sum: number, item: any) => sum + item.lineTotal, 0),
      itemCount: items.reduce((sum: number, item: any) => sum + item.quantity, 0)
    }
  };
}
