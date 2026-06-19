import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

function loadEnvFile(filename) {
  const fullPath = path.join(process.cwd(), filename);
  if (!fs.existsSync(fullPath)) return;

  const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;

    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function zonedWallTimeToUtc(isoDate, hour, minute, second, timeZone) {
  const [y, m, d] = isoDate.split("-").map((v) => Number(v));
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  function readParts(instant) {
    const parts = formatter.formatToParts(instant);
    const map = {};
    for (const p of parts) {
      if (p.type !== "literal") map[p.type] = Number(p.value);
    }
    return map;
  }

  let guess = new Date(Date.UTC(y, m - 1, d, hour, minute, second, 0));
  for (let i = 0; i < 24; i += 1) {
    const got = readParts(guess);
    const targetUtc = Date.UTC(y, m - 1, d, hour, minute, second);
    const gotUtc = Date.UTC(got.year, got.month - 1, got.day, got.hour, got.minute, got.second);
    const drift = targetUtc - gotUtc;
    if (drift === 0) return guess;
    guess = new Date(guess.getTime() + drift);
  }
  throw new Error(`Could not resolve wall time in timezone ${timeZone}`);
}

function todayIsoInTimeZone(timeZone, instant = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(instant);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  const d = parts.find((p) => p.type === "day")?.value;
  return `${y}-${m}-${d}`;
}

function addSalonLocalDays(isoDate, days, timeZone) {
  const noon = zonedWallTimeToUtc(isoDate, 12, 0, 0, timeZone);
  return todayIsoInTimeZone(timeZone, new Date(noon.getTime() + days * 24 * 60 * 60 * 1000));
}

const DEMO_SHOP_LAT = 35.1856;
const DEMO_SHOP_LNG = 33.3823;

const TEST_CUSTOMERS = [
  { name: "Γιάννης Παπαδόπουλος", phone: "+35799100001" },
  { name: "Μαρία Κωνσταντίνου", phone: "+35799100002" },
  { name: "Νίκος Αντωνίου", phone: "+35799100003" },
  { name: "Ελένη Γεωργίου", phone: "+35799100004" },
  { name: "Δημήτρης Χριστοδούλου", phone: "+35799100005" },
  { name: "Σοφία Αναστασίου", phone: "+35799100006" },
  { name: "Αντώνης Μιχαήλ", phone: "+35799100007" },
  { name: "Κατερίνα Παναγιώτου", phone: "+35799100008" },
  { name: "Πέτρος Σάββα", phone: "+35799100009" },
  { name: "Χριστίνα Λουκά", phone: "+35799100010" },
  { name: "Ανδρέας Παύλου", phone: "+35799100011" },
  { name: "Ιωάννα Δημητρίου", phone: "+35799100012" },
  { name: "Μιχάλης Οικονόμου", phone: "+35799100013" },
  { name: "Άννα Στεφάνου", phone: "+35799100014" },
  { name: "Κώστας Νικολάου", phone: "+35799100015" },
  { name: "Βασιλική Αλεξάνδρου", phone: "+35799100016" },
  { name: "Γιώργος Χαραλάμπους", phone: "+35799100017" },
  { name: "Φωτεινή Μάρκου", phone: "+35799100018" },
  { name: "Λεωνίδας Πέτρου", phone: "+35799100019" },
  { name: "Δέσποινα Αργύρου", phone: "+35799100020" },
];

const DELIVERY_ADDRESSES = [
  { address: "Λεωφόρος Μακαρίου 45, Λευκωσία", lat: 35.1721, lng: 33.3642, distance: 2100 },
  { address: "Στασίνου 12, Λευκωσία", lat: 35.1688, lng: 33.3521, distance: 3200 },
  { address: "Γρίβα Διγενή 88, Λευκωσία", lat: 35.1592, lng: 33.3715, distance: 2800 },
  { address: "Λεωφόρος Αθηνών 102, Λευκωσία", lat: 35.1812, lng: 33.3891, distance: 850 },
  { address: "Κηρυνείας 23, Λευκωσία", lat: 35.1745, lng: 33.3588, distance: 2400 },
];

const TODAY_ORDER_SPECS = [
  { hour: 11, minute: 15, status: "CONFIRMED", fulfillment: "PICKUP", customerIdx: 0, items: [{ idx: 0, qty: 2 }], notes: null },
  { hour: 12, minute: 0, status: "PREPARING", fulfillment: "PICKUP", customerIdx: 1, items: [{ idx: 5, qty: 1 }, { idx: 14, qty: 1 }], notes: "Χωρίς κρεμμύδι" },
  { hour: 13, minute: 30, status: "READY", fulfillment: "DELIVERY", customerIdx: 2, items: [{ idx: 8, qty: 1 }, { idx: 10, qty: 2 }], notes: "Κουδούνι δεν δουλεύει", deliveryIdx: 0 },
  { hour: 14, minute: 45, status: "OUT_FOR_DELIVERY", fulfillment: "DELIVERY", customerIdx: 3, items: [{ idx: 6, qty: 2 }], notes: null, deliveryIdx: 1 },
  { hour: 15, minute: 20, status: "COMPLETED", fulfillment: "PICKUP", customerIdx: 4, items: [{ idx: 1, qty: 3 }], notes: null },
  { hour: 16, minute: 0, status: "CONFIRMED", fulfillment: "PICKUP", customerIdx: 5, items: [{ idx: 9, qty: 1 }, { idx: 11, qty: 1 }], notes: "Έξτρα σως" },
  { hour: 17, minute: 15, status: "PREPARING", fulfillment: "DELIVERY", customerIdx: 6, items: [{ idx: 7, qty: 1 }, { idx: 13, qty: 1 }], notes: null, deliveryIdx: 2 },
  { hour: 18, minute: 30, status: "READY", fulfillment: "PICKUP", customerIdx: 7, items: [{ idx: 2, qty: 2 }, { idx: 14, qty: 2 }], notes: "Πικάντικο" },
  { hour: 19, minute: 0, status: "CANCELLED", fulfillment: "PICKUP", customerIdx: 8, items: [{ idx: 4, qty: 1 }], notes: "Ακυρώθηκε από πελάτη" },
  { hour: 20, minute: 15, status: "CONFIRMED", fulfillment: "DELIVERY", customerIdx: 9, items: [{ idx: 12, qty: 1 }, { idx: 14, qty: 1 }, { idx: 13, qty: 2 }], notes: "Όροφος 3", deliveryIdx: 3 },
  { hour: 11, minute: 45, status: "CONFIRMED", fulfillment: "DELIVERY", customerIdx: 10, items: [{ idx: 3, qty: 1 }, { idx: 14, qty: 1 }], notes: null, deliveryIdx: 4 },
  { hour: 12, minute: 30, status: "PREPARING", fulfillment: "PICKUP", customerIdx: 11, items: [{ idx: 8, qty: 1 }], notes: "Χωρίς πατάτες" },
  { hour: 14, minute: 10, status: "CONFIRMED", fulfillment: "PICKUP", customerIdx: 12, items: [{ idx: 5, qty: 2 }], notes: null },
  { hour: 15, minute: 50, status: "OUT_FOR_DELIVERY", fulfillment: "DELIVERY", customerIdx: 13, items: [{ idx: 9, qty: 1 }, { idx: 10, qty: 1 }], notes: "Αφήστε στην πόρτα", deliveryIdx: 0 },
  { hour: 21, minute: 0, status: "PREPARING", fulfillment: "PICKUP", customerIdx: 14, items: [{ idx: 0, qty: 4 }, { idx: 14, qty: 2 }], notes: "Γρήγορα παρακαλώ" },
];

const YESTERDAY_ORDER_SPECS = [
  { hour: 11, minute: 30, status: "COMPLETED", fulfillment: "PICKUP", customerIdx: 10, items: [{ idx: 0, qty: 1 }, { idx: 14, qty: 1 }] },
  { hour: 12, minute: 45, status: "COMPLETED", fulfillment: "DELIVERY", customerIdx: 11, items: [{ idx: 5, qty: 2 }], deliveryIdx: 4 },
  { hour: 13, minute: 15, status: "COMPLETED", fulfillment: "PICKUP", customerIdx: 12, items: [{ idx: 3, qty: 2 }] },
  { hour: 14, minute: 0, status: "COMPLETED", fulfillment: "DELIVERY", customerIdx: 13, items: [{ idx: 8, qty: 1 }, { idx: 13, qty: 1 }], deliveryIdx: 0 },
  { hour: 15, minute: 30, status: "COMPLETED", fulfillment: "PICKUP", customerIdx: 14, items: [{ idx: 6, qty: 1 }, { idx: 11, qty: 1 }] },
  { hour: 16, minute: 45, status: "COMPLETED", fulfillment: "DELIVERY", customerIdx: 15, items: [{ idx: 9, qty: 1 }], deliveryIdx: 1 },
  { hour: 18, minute: 0, status: "COMPLETED", fulfillment: "PICKUP", customerIdx: 16, items: [{ idx: 2, qty: 1 }, { idx: 10, qty: 2 }, { idx: 14, qty: 1 }] },
  { hour: 19, minute: 20, status: "CANCELLED", fulfillment: "DELIVERY", customerIdx: 17, items: [{ idx: 7, qty: 1 }], notes: "Δεν απάντησε στο τηλέφωνο", deliveryIdx: 2 },
  { hour: 20, minute: 30, status: "COMPLETED", fulfillment: "PICKUP", customerIdx: 18, items: [{ idx: 1, qty: 2 }, { idx: 13, qty: 1 }] },
  { hour: 21, minute: 45, status: "COMPLETED", fulfillment: "DELIVERY", customerIdx: 19, items: [{ idx: 4, qty: 1 }, { idx: 12, qty: 2 }], deliveryIdx: 3 },
];

async function ensureShop(prisma) {
  let shop = await prisma.shop.findFirst();
  if (shop) return shop;

  shop = await prisma.shop.create({
    data: {
      name: "Souvlaki House",
      timezone: "Europe/Nicosia",
      latitude: DEMO_SHOP_LAT,
      longitude: DEMO_SHOP_LNG,
      deliveryRadiusMeters: 5000,
      prepMinutes: 25,
      deliveryPrepMinutes: 45,
      hours: {
        create: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
          weekday,
          startHour: 11,
          endHour: 23,
        })),
      },
      categories: {
        create: [
          {
            name: "Σουβλάκια",
            sortOrder: 1,
            items: {
              create: [
                { name: "Σουβλάκι χοιρινό", priceCents: 350, sortOrder: 1 },
                { name: "Σουβλάκι κοτόπουλο", priceCents: 350, sortOrder: 2 },
                { name: "Σουβλάκι κεμπάπ", priceCents: 400, sortOrder: 3 },
                { name: "Καλαμάκι χοιρινό", priceCents: 450, sortOrder: 4 },
              ],
            },
          },
          {
            name: "Πίτες",
            sortOrder: 2,
            items: {
              create: [
                { name: "Πίτα γύρο χοιρινό", priceCents: 550, sortOrder: 1 },
                { name: "Πίτα γύρο κοτόπουλο", priceCents: 550, sortOrder: 2 },
                { name: "Πίτα κεμπάπ", priceCents: 600, sortOrder: 3 },
                { name: "Πίτα μικτή", priceCents: 650, sortOrder: 4 },
              ],
            },
          },
          {
            name: "Μερίδες",
            sortOrder: 3,
            items: {
              create: [
                { name: "Μερίδα γύρο χοιρινό", priceCents: 900, sortOrder: 1 },
                { name: "Μερίδα κοτόπουλο", priceCents: 900, sortOrder: 2 },
                { name: "Πατάτες τηγανητές", priceCents: 350, sortOrder: 3 },
                { name: "Χωριάτικη σαλάτα", priceCents: 500, sortOrder: 4 },
              ],
            },
          },
          {
            name: "Ποτά",
            sortOrder: 4,
            items: {
              create: [
                { name: "Coca-Cola 330ml", priceCents: 200, sortOrder: 1 },
                { name: "Νερό 500ml", priceCents: 100, sortOrder: 2 },
                { name: "Μπύρα 330ml", priceCents: 300, sortOrder: 3 },
              ],
            },
          },
        ],
      },
    },
  });
  return shop;
}

async function getNextOrderNumber(prisma, shopId, orderDate) {
  const last = await prisma.order.findFirst({
    where: { shopId, orderDate },
    orderBy: { orderNumber: "desc" },
    select: { orderNumber: true },
  });
  return (last?.orderNumber ?? 0) + 1;
}

async function upsertCustomer(prisma, shopId, { name, phone }) {
  return prisma.customer.upsert({
    where: { shopId_phoneE164: { shopId, phoneE164: phone } },
    create: { shopId, name, phoneE164: phone },
    update: { name },
  });
}

function buildLineItems(menuItems, itemSpecs) {
  return itemSpecs.map(({ idx, qty }) => {
    const item = menuItems[idx];
    if (!item) throw new Error(`Menu item index ${idx} not found`);
    return {
      menuItemId: item.id,
      nameSnapshot: item.name,
      priceCentsSnapshot: item.priceCents,
      quantity: qty,
    };
  });
}

function calcTotals(lines) {
  const subtotalCents = lines.reduce((sum, line) => sum + line.priceCentsSnapshot * line.quantity, 0);
  return { subtotalCents, totalCents: subtotalCents };
}

async function createOrdersForDay(prisma, shop, menuItems, orderDate, specs, label) {
  const created = [];

  for (const spec of specs) {
    const customer = TEST_CUSTOMERS[spec.customerIdx];
    const dbCustomer = await upsertCustomer(prisma, shop.id, customer);
    const lines = buildLineItems(menuItems, spec.items);
    const { subtotalCents, totalCents } = calcTotals(lines);
    const orderNumber = await getNextOrderNumber(prisma, shop.id, orderDate);
    const requestedAt = zonedWallTimeToUtc(orderDate, spec.hour, spec.minute, 0, shop.timezone);

    const delivery =
      spec.fulfillment === "DELIVERY"
        ? DELIVERY_ADDRESSES[spec.deliveryIdx ?? 0]
        : null;

    const order = await prisma.order.create({
      data: {
        shopId: shop.id,
        customerId: dbCustomer.id,
        orderNumber,
        orderDate,
        fulfillmentType: spec.fulfillment,
        deliveryAddress: delivery?.address ?? null,
        deliveryLat: delivery?.lat ?? null,
        deliveryLng: delivery?.lng ?? null,
        deliveryDistanceMeters: delivery?.distance ?? null,
        requestedAt,
        subtotalCents,
        totalCents,
        status: spec.status,
        locale: "el",
        notes: spec.notes ?? null,
        createdAt: requestedAt,
        items: { create: lines },
      },
    });

    created.push({
      orderNumber,
      status: spec.status,
      fulfillment: spec.fulfillment,
      customer: customer.name,
      time: `${String(spec.hour).padStart(2, "0")}:${String(spec.minute).padStart(2, "0")}`,
      id: order.id,
    });
  }

  console.log(`\n${label} (${orderDate}) — ${created.length} παραγγελίες:`);
  for (const row of created) {
    console.log(
      `  #${row.orderNumber} ${row.time} ${row.status.padEnd(16)} ${row.fulfillment.padEnd(8)} ${row.customer}`,
    );
  }

  return created.length;
}

loadEnvFile(".env.local");
loadEnvFile(".env");

const prisma = new PrismaClient();

try {
  const shop = await ensureShop(prisma);
  const menuItems = await prisma.menuItem.findMany({
    where: { category: { shopId: shop.id }, active: true },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
  });

  if (menuItems.length < 15) {
    throw new Error(`Expected at least 15 menu items, found ${menuItems.length}`);
  }

  const todayIso = todayIsoInTimeZone(shop.timezone);
  const yesterdayIso = addSalonLocalDays(todayIso, -1, shop.timezone);

  console.log(`Shop: ${shop.name} (${shop.timezone})`);
  console.log(`Σήμερα: ${todayIso}`);
  console.log(`Χθες: ${yesterdayIso}`);

  const countArg = Number(process.argv[2]);
  const todaySpecs =
    countArg > 0 ? TODAY_ORDER_SPECS.slice(0, countArg) : TODAY_ORDER_SPECS;

  const todayCount = await createOrdersForDay(
    prisma,
    shop,
    menuItems,
    todayIso,
    todaySpecs,
    "Σήμερα",
  );

  console.log(`\nΈτοιμο: ${todayCount} test παραγγελίες δημιουργήθηκαν για σήμερα.`);
  console.log("Dashboard: /dashboard");
} catch (error) {
  console.error("Σφάλμα:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
