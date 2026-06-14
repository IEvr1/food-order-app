import { prisma } from "@/lib/prisma";

const DEMO_SHOP_LAT = 35.1856;
const DEMO_SHOP_LNG = 33.3823;

export async function ensureShopSeed() {
  const shopCount = await prisma.shop.count();
  if (shopCount > 0) {
    return;
  }

  await prisma.shop.create({
    data: {
      name: "Souvlaki House",
      timezone: "Europe/Nicosia",
      latitude: DEMO_SHOP_LAT,
      longitude: DEMO_SHOP_LNG,
      deliveryRadiusMeters: 0,
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
}