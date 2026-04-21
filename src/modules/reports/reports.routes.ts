import { Router } from "express";
import PDFDocument from "pdfkit";

import { prisma } from "../../lib/prisma.js";
import { authenticate, type AuthenticatedRequest } from "../../middleware/authenticate.js";
import { requireRole } from "../../middleware/require-role.js";

export const reportsRouter = Router();

type DateRange = {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
};

type PeriodSummary = {
  label: string;
  startDate: string;
  endDate: string;
  salesTotal: number;
  paymentCount: number;
  ordersCount: number;
  itemsSold: number;
  averageOrderValue: number;
  mostBoughtItem: {
    menuItemId: number;
    name: string;
    quantity: number;
    revenue: number;
  } | null;
};

function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDateInput(dateInput?: string) {
  const value = dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ? dateInput
    : new Date().toISOString().slice(0, 10);
  const [year, month, day] = value.split("-").map(Number);

  return { value, year, month, day };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;

  const asUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second
  );

  return asUtc - date.getTime();
}

function zonedDateStart(dateString: string, timeZone: string) {
  const { year, month, day } = parseDateInput(dateString);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function addDays(dateString: string, deltaDays: number) {
  const { year, month, day } = parseDateInput(dateString);
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function addMonths(dateString: string, deltaMonths: number) {
  const { year, month, day } = parseDateInput(dateString);
  const date = new Date(Date.UTC(year, month - 1 + deltaMonths, 1));
  const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, maxDay));
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function getDateRange(dateString: string, timeZone: string, mode: "day" | "week" | "month"): DateRange {
  const parsed = parseDateInput(dateString);

  if (mode === "day") {
    const start = zonedDateStart(parsed.value, timeZone);
    const nextStart = zonedDateStart(addDays(parsed.value, 1), timeZone);

    return {
      start,
      end: new Date(nextStart.getTime() - 1),
      startDate: parsed.value,
      endDate: parsed.value
    };
  }

  if (mode === "week") {
    const anchor = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day));
    const weekday = anchor.getUTCDay();
    const daysFromMonday = (weekday + 6) % 7;
    const startDate = addDays(parsed.value, -daysFromMonday);
    const endDate = addDays(startDate, 6);
    const start = zonedDateStart(startDate, timeZone);
    const nextStart = zonedDateStart(addDays(endDate, 1), timeZone);

    return {
      start,
      end: new Date(nextStart.getTime() - 1),
      startDate,
      endDate
    };
  }

  const startDate = formatDateParts(parsed.year, parsed.month, 1);
  const endDate = formatDateParts(
    parsed.month === 12 ? parsed.year + 1 : parsed.year,
    parsed.month === 12 ? 1 : parsed.month + 1,
    0
  );
  const start = zonedDateStart(startDate, timeZone);
  const nextStart = zonedDateStart(addDays(endDate, 1), timeZone);

  return {
    start,
    end: new Date(nextStart.getTime() - 1),
    startDate,
    endDate
  };
}

async function buildPeriodSummary(tenantId: number, label: string, range: DateRange): Promise<PeriodSummary> {
  const [payments, orders] = await Promise.all([
    prisma.payment.findMany({
      where: {
        tenantId,
        paidAt: { gte: range.start, lte: range.end }
      }
    }),
    prisma.order.findMany({
      where: {
        tenantId,
        createdAt: { gte: range.start, lte: range.end }
      },
      include: {
        items: {
          include: {
            menuItem: {
              select: { id: true, name: true }
            }
          }
        }
      }
    })
  ]);

  const itemMap = new Map<number, { menuItemId: number; name: string; quantity: number; revenue: number }>();

  for (const order of orders) {
    for (const item of order.items) {
      const current = itemMap.get(item.menuItemId) ?? {
        menuItemId: item.menuItemId,
        name: item.menuItem.name,
        quantity: 0,
        revenue: 0
      };
      current.quantity += item.quantity;
      current.revenue += Number(item.unitPrice) * item.quantity;
      itemMap.set(item.menuItemId, current);
    }
  }

  const rankedItems = Array.from(itemMap.values()).sort((left, right) => {
    if (right.quantity !== left.quantity) {
      return right.quantity - left.quantity;
    }

    return right.revenue - left.revenue;
  });

  const salesTotal = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const itemsSold = orders.flatMap((order) => order.items).reduce((sum, item) => sum + item.quantity, 0);

  return {
    label,
    startDate: range.startDate,
    endDate: range.endDate,
    salesTotal,
    paymentCount: payments.length,
    ordersCount: orders.length,
    itemsSold,
    averageOrderValue: orders.length > 0 ? salesTotal / orders.length : 0,
    mostBoughtItem: rankedItems[0] ?? null
  };
}

async function buildDailyTrend(tenantId: number, anchorDate: string, timeZone: string, days: number) {
  const entries = await Promise.all(
    Array.from({ length: days }, (_, index) => {
      const date = addDays(anchorDate, index - (days - 1));
      const range = getDateRange(date, timeZone, "day");
      return buildPeriodSummary(tenantId, date, range);
    })
  );

  return entries.map((entry) => ({
    label: entry.label,
    startDate: entry.startDate,
    endDate: entry.endDate,
    salesTotal: entry.salesTotal,
    ordersCount: entry.ordersCount,
    itemsSold: entry.itemsSold
  }));
}

async function buildWeeklyTrend(tenantId: number, anchorDate: string, timeZone: string, weeks: number) {
  const anchorWeek = getDateRange(anchorDate, timeZone, "week");
  const entries = await Promise.all(
    Array.from({ length: weeks }, (_, index) => {
      const startDate = addDays(anchorWeek.startDate, (index - (weeks - 1)) * 7);
      const range = getDateRange(startDate, timeZone, "week");
      return buildPeriodSummary(tenantId, `${range.startDate} to ${range.endDate}`, range);
    })
  );

  return entries.map((entry) => ({
    label: entry.label,
    startDate: entry.startDate,
    endDate: entry.endDate,
    salesTotal: entry.salesTotal,
    ordersCount: entry.ordersCount,
    itemsSold: entry.itemsSold
  }));
}

async function buildMonthlyTrend(tenantId: number, anchorDate: string, timeZone: string, months: number) {
  const entries = await Promise.all(
    Array.from({ length: months }, (_, index) => {
      const date = addMonths(anchorDate, index - (months - 1));
      const range = getDateRange(date, timeZone, "month");
      return buildPeriodSummary(tenantId, range.startDate.slice(0, 7), range);
    })
  );

  return entries.map((entry) => ({
    label: entry.label,
    startDate: entry.startDate,
    endDate: entry.endDate,
    salesTotal: entry.salesTotal,
    ordersCount: entry.ordersCount,
    itemsSold: entry.itemsSold
  }));
}

reportsRouter.use(authenticate);
reportsRouter.use(requireRole(["SUPER_ADMIN", "MANAGER", "CASHIER"]));

function formatCurrency(amount: number, currency: string) {
  return `${currency} ${amount.toFixed(2)}`;
}

function buildDailyPdf(
  doc: InstanceType<typeof PDFDocument>,
  data: {
    tenantName: string;
    currency: string;
    date: string;
    salesTotal: number;
    paymentCount: number;
    ordersCount: number;
    itemsSold: number;
    mostBoughtItem: { name: string; quantity: number; revenue: number } | null;
    lowStockItems: { name: string; quantity: number; reorderLevel: number; unit: string | null }[];
  }
) {
  const { tenantName, currency, date } = data;

  doc.fontSize(20).font("Helvetica-Bold").text(tenantName, { align: "center" });
  doc.fontSize(12).font("Helvetica").text(`Daily Sales Report — ${date}`, { align: "center" });
  doc.moveDown(1.5);

  doc.fontSize(13).font("Helvetica-Bold").text("Sales Summary");
  doc.moveDown(0.4);

  const rows = [
    ["Total Sales", formatCurrency(data.salesTotal, currency)],
    ["Orders", String(data.ordersCount)],
    ["Payments Received", String(data.paymentCount)],
    ["Items Sold", String(data.itemsSold)],
    ["Avg. Order Value", data.ordersCount > 0 ? formatCurrency(data.salesTotal / data.ordersCount, currency) : "—"]
  ];
  for (const [label, value] of rows) {
    doc.fontSize(11).font("Helvetica-Bold").text(label + ":", { continued: true }).font("Helvetica").text(`  ${value}`);
  }

  if (data.mostBoughtItem) {
    doc.moveDown(1).fontSize(13).font("Helvetica-Bold").text("Top Selling Item");
    doc.moveDown(0.4).fontSize(11).font("Helvetica")
      .text(`${data.mostBoughtItem.name} — ${data.mostBoughtItem.quantity} sold (${formatCurrency(data.mostBoughtItem.revenue, currency)})`);
  }

  if (data.lowStockItems.length > 0) {
    doc.moveDown(1).fontSize(13).font("Helvetica-Bold").text("Low Stock Alert");
    doc.moveDown(0.4);
    for (const item of data.lowStockItems) {
      doc.fontSize(11).font("Helvetica")
        .text(`• ${item.name}: ${item.quantity}${item.unit ? " " + item.unit : ""} (reorder at ${item.reorderLevel})`);
    }
  } else {
    doc.moveDown(1).fontSize(11).font("Helvetica").text("No low-stock items.");
  }

  doc.moveDown(2).fontSize(9).fillColor("#888888").text(`Generated on ${new Date().toISOString()}`, { align: "right" });
}

function buildOverviewPdf(
  doc: InstanceType<typeof PDFDocument>,
  data: {
    tenantName: string;
    currency: string;
    anchorDate: string;
    daily: { salesTotal: number; ordersCount: number; itemsSold: number; averageOrderValue: number };
    weekly: { salesTotal: number; ordersCount: number; itemsSold: number; averageOrderValue: number };
    monthly: { salesTotal: number; ordersCount: number; itemsSold: number; averageOrderValue: number };
    stockSnapshot: { totalTrackedItems: number; lowStockCount: number; lowStockItems: { name: string; quantity: number; reorderLevel: number; unit: string | null }[] };
    dailyTrend: { label: string; salesTotal: number; ordersCount: number }[];
  }
) {
  const { tenantName, currency, anchorDate } = data;

  doc.fontSize(20).font("Helvetica-Bold").text(tenantName, { align: "center" });
  doc.fontSize(12).font("Helvetica").text(`Sales Overview Report — ${anchorDate}`, { align: "center" });
  doc.moveDown(1.5);

  const periods = [
    ["Today", data.daily],
    ["This Week", data.weekly],
    ["This Month", data.monthly]
  ] as const;

  for (const [label, summary] of periods) {
    doc.fontSize(13).font("Helvetica-Bold").text(label);
    doc.moveDown(0.4);
    const rows = [
      ["Total Sales", formatCurrency(summary.salesTotal, currency)],
      ["Orders", String(summary.ordersCount)],
      ["Items Sold", String(summary.itemsSold)],
      ["Avg. Order Value", formatCurrency(summary.averageOrderValue, currency)]
    ];
    for (const [key, value] of rows) {
      doc.fontSize(11).font("Helvetica-Bold").text(key + ":", { continued: true }).font("Helvetica").text(`  ${value}`);
    }
    doc.moveDown(1);
  }

  doc.fontSize(13).font("Helvetica-Bold").text("7-Day Sales Trend");
  doc.moveDown(0.4);
  for (const entry of data.dailyTrend) {
    doc.fontSize(11).font("Helvetica")
      .text(`${entry.label}: ${formatCurrency(entry.salesTotal, currency)} (${entry.ordersCount} orders)`);
  }

  doc.moveDown(1).fontSize(13).font("Helvetica-Bold").text("Inventory Snapshot");
  doc.moveDown(0.4).fontSize(11).font("Helvetica")
    .text(`Tracked items: ${data.stockSnapshot.totalTrackedItems}  |  Low stock: ${data.stockSnapshot.lowStockCount}`);

  if (data.stockSnapshot.lowStockItems.length > 0) {
    doc.moveDown(0.6);
    for (const item of data.stockSnapshot.lowStockItems) {
      doc.fontSize(11).font("Helvetica")
        .text(`• ${item.name}: ${item.quantity}${item.unit ? " " + item.unit : ""} (reorder at ${item.reorderLevel})`);
    }
  }

  doc.moveDown(2).fontSize(9).fillColor("#888888").text(`Generated on ${new Date().toISOString()}`, { align: "right" });
}

reportsRouter.get("/daily", async (req: AuthenticatedRequest, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.auth!.tenantId },
    select: { timezone: true }
  });
  const timeZone = tenant?.timezone ?? "UTC";
  const dateInput = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);
  const dailyRange = getDateRange(dateInput, timeZone, "day");

  const [summary, lowStockItems] = await Promise.all([
    buildPeriodSummary(req.auth!.tenantId, dateInput, dailyRange),
    prisma.stockItem.findMany({
      where: { tenantId: req.auth!.tenantId },
      orderBy: { name: "asc" }
    })
  ]);

  return res.json({
    date: dateInput,
    salesTotal: summary.salesTotal,
    paymentCount: summary.paymentCount,
    ordersCount: summary.ordersCount,
    itemsSold: summary.itemsSold,
    mostBoughtItem: summary.mostBoughtItem,
    lowStockItems: lowStockItems
      .filter((item) => Number(item.quantity) <= Number(item.reorderLevel))
      .map((item) => ({
        id: item.id,
        name: item.name,
        quantity: Number(item.quantity),
        reorderLevel: Number(item.reorderLevel),
        unit: item.unit
      }))
  });
});

reportsRouter.get("/overview", async (req: AuthenticatedRequest, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.auth!.tenantId },
    select: { timezone: true, currency: true, name: true }
  });
  const timeZone = tenant?.timezone ?? "UTC";
  const anchorDate = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);

  const dailyRange = getDateRange(anchorDate, timeZone, "day");
  const weeklyRange = getDateRange(anchorDate, timeZone, "week");
  const monthlyRange = getDateRange(anchorDate, timeZone, "month");

  const [daily, weekly, monthly, stockItems, dailyTrend, weeklyTrend, monthlyTrend] = await Promise.all([
    buildPeriodSummary(req.auth!.tenantId, "Daily", dailyRange),
    buildPeriodSummary(req.auth!.tenantId, "Weekly", weeklyRange),
    buildPeriodSummary(req.auth!.tenantId, "Monthly", monthlyRange),
    prisma.stockItem.findMany({
      where: { tenantId: req.auth!.tenantId },
      orderBy: [{ quantity: "asc" }, { name: "asc" }]
    }),
    buildDailyTrend(req.auth!.tenantId, anchorDate, timeZone, 7),
    buildWeeklyTrend(req.auth!.tenantId, anchorDate, timeZone, 8),
    buildMonthlyTrend(req.auth!.tenantId, anchorDate, timeZone, 6)
  ]);

  const lowStockItems = stockItems
    .filter((item) => Number(item.quantity) <= Number(item.reorderLevel))
    .map((item) => ({
      id: item.id,
      name: item.name,
      quantity: Number(item.quantity),
      reorderLevel: Number(item.reorderLevel),
      unit: item.unit
    }));

  return res.json({
    anchorDate,
    tenantName: tenant?.name ?? null,
    currency: tenant?.currency ?? "KES",
    timezone: timeZone,
    daily,
    weekly,
    monthly,
    stockSnapshot: {
      totalTrackedItems: stockItems.length,
      lowStockCount: lowStockItems.length,
      lowStockItems
    },
    dailyTrend,
    weeklyTrend,
    monthlyTrend
  });
});

reportsRouter.get("/daily/pdf", async (req: AuthenticatedRequest, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.auth!.tenantId },
    select: { timezone: true, currency: true, name: true }
  });
  const timeZone = tenant?.timezone ?? "UTC";
  const currency = tenant?.currency ?? "KES";
  const tenantName = tenant?.name ?? "Restaurant";
  const dateInput = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);
  const dailyRange = getDateRange(dateInput, timeZone, "day");

  const [summary, stockItems] = await Promise.all([
    buildPeriodSummary(req.auth!.tenantId, dateInput, dailyRange),
    prisma.stockItem.findMany({ where: { tenantId: req.auth!.tenantId }, orderBy: { name: "asc" } })
  ]);

  const lowStockItems = stockItems
    .filter((item) => Number(item.quantity) <= Number(item.reorderLevel))
    .map((item) => ({ name: item.name, quantity: Number(item.quantity), reorderLevel: Number(item.reorderLevel), unit: item.unit }));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="daily-report-${dateInput}.pdf"`);

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.pipe(res);
  buildDailyPdf(doc, {
    tenantName,
    currency,
    date: dateInput,
    salesTotal: summary.salesTotal,
    paymentCount: summary.paymentCount,
    ordersCount: summary.ordersCount,
    itemsSold: summary.itemsSold,
    mostBoughtItem: summary.mostBoughtItem,
    lowStockItems
  });
  doc.end();
});

reportsRouter.get("/overview/pdf", async (req: AuthenticatedRequest, res) => {
  const tenant = await prisma.tenant.findUnique({
    where: { id: req.auth!.tenantId },
    select: { timezone: true, currency: true, name: true }
  });
  const timeZone = tenant?.timezone ?? "UTC";
  const currency = tenant?.currency ?? "KES";
  const tenantName = tenant?.name ?? "Restaurant";
  const anchorDate = req.query.date ? String(req.query.date) : new Date().toISOString().slice(0, 10);

  const dailyRange = getDateRange(anchorDate, timeZone, "day");
  const weeklyRange = getDateRange(anchorDate, timeZone, "week");
  const monthlyRange = getDateRange(anchorDate, timeZone, "month");

  const [daily, weekly, monthly, stockItems, dailyTrend] = await Promise.all([
    buildPeriodSummary(req.auth!.tenantId, "Daily", dailyRange),
    buildPeriodSummary(req.auth!.tenantId, "Weekly", weeklyRange),
    buildPeriodSummary(req.auth!.tenantId, "Monthly", monthlyRange),
    prisma.stockItem.findMany({ where: { tenantId: req.auth!.tenantId }, orderBy: [{ quantity: "asc" }, { name: "asc" }] }),
    buildDailyTrend(req.auth!.tenantId, anchorDate, timeZone, 7)
  ]);

  const lowStockItems = stockItems
    .filter((item) => Number(item.quantity) <= Number(item.reorderLevel))
    .map((item) => ({ name: item.name, quantity: Number(item.quantity), reorderLevel: Number(item.reorderLevel), unit: item.unit }));

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="overview-report-${anchorDate}.pdf"`);

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  doc.pipe(res);
  buildOverviewPdf(doc, {
    tenantName,
    currency,
    anchorDate,
    daily,
    weekly,
    monthly,
    stockSnapshot: { totalTrackedItems: stockItems.length, lowStockCount: lowStockItems.length, lowStockItems },
    dailyTrend
  });
  doc.end();
});
