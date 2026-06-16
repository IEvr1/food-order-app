-- Separate delivery hours per weekday (pickup uses ShopHours)

CREATE TABLE "ShopDeliveryHours" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    CONSTRAINT "ShopDeliveryHours_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ShopDeliveryHours" ADD CONSTRAINT "ShopDeliveryHours_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy existing shop hours as default delivery hours for existing shops
INSERT INTO "ShopDeliveryHours" ("id", "shopId", "weekday", "startHour", "endHour")
SELECT md5("shopId" || "weekday"::text || 'delivery'), "shopId", "weekday", "startHour", "endHour"
FROM "ShopHours";
