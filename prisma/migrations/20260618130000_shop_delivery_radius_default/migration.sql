-- Default delivery radius for shops that already have coordinates but radius 0
UPDATE "Shop"
SET "deliveryRadiusMeters" = 3000
WHERE "deliveryRadiusMeters" = 0
  AND "latitude" IS NOT NULL
  AND "longitude" IS NOT NULL;
