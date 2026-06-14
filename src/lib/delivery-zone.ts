export type GeoPoint = { lat: number; lng: number };

export type ShopDeliveryConfig = {
  latitude: number | null;
  longitude: number | null;
  deliveryRadiusMeters: number;
};

const EARTH_RADIUS_METERS = 6_371_000;

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function isDeliveryEnabled(shop: ShopDeliveryConfig): boolean {
  return (
    shop.latitude != null &&
    shop.longitude != null &&
    shop.deliveryRadiusMeters > 0
  );
}

export function validateDeliveryLocation(
  shop: ShopDeliveryConfig,
  delivery: GeoPoint,
):
  | { ok: true; distanceMeters: number }
  | { ok: false; error: "DELIVERY_DISABLED" | "INVALID_COORDINATES" | "OUT_OF_DELIVERY_ZONE" } {
  if (!isDeliveryEnabled(shop)) {
    return { ok: false, error: "DELIVERY_DISABLED" };
  }
  if (!isValidCoordinate(delivery.lat, delivery.lng)) {
    return { ok: false, error: "INVALID_COORDINATES" };
  }

  const dist = distanceMeters(
    { lat: shop.latitude!, lng: shop.longitude! },
    delivery,
  );

  if (dist > shop.deliveryRadiusMeters) {
    return { ok: false, error: "OUT_OF_DELIVERY_ZONE" };
  }

  return { ok: true, distanceMeters: Math.round(dist) };
}

export function formatDistanceKm(meters: number): string {
  return (meters / 1000).toFixed(1);
}
