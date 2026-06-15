import { distanceMeters, type GeoPoint } from "@/lib/delivery-zone";

/** Driving duration from Google Routes × this factor ≈ motorcycle ETA (Cyprus has no TWO_WHEELER mode). */
export const MOTO_ETA_FACTOR = 0.85;

/** Urban motorcycle speed fallback (~30 km/h). */
const MOTO_SPEED_METERS_PER_MIN = 500;

const ROUTES_API_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export type DeliveryEtaResult = {
  estimatedArrivalAt: Date;
  etaMinutes: number;
};

function googleMapsApiKey(): string | null {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    null
  );
}

export function parseGoogleDurationSeconds(duration: string | undefined): number | null {
  if (!duration?.endsWith("s")) return null;
  const seconds = Number.parseInt(duration.slice(0, -1), 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function fetchRoutesDrivingSeconds(
  origin: GeoPoint,
  destination: GeoPoint,
  departAt: Date,
): Promise<number | null> {
  const apiKey = googleMapsApiKey();
  if (!apiKey) return null;

  try {
    const response = await fetch(ROUTES_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration",
      },
      body: JSON.stringify({
        origin: {
          location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
        },
        destination: {
          location: { latLng: { latitude: destination.lat, longitude: destination.lng } },
        },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        departureTime: departAt.toISOString(),
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error("Routes API failed", response.status, detail.slice(0, 300));
      return null;
    }

    const data = (await response.json()) as {
      routes?: { duration?: string }[];
    };
    return parseGoogleDurationSeconds(data.routes?.[0]?.duration);
  } catch (error) {
    console.error("Routes API request error", error);
    return null;
  }
}

function fallbackMotoMinutes(distanceMeters: number): number {
  return Math.max(5, Math.round(distanceMeters / MOTO_SPEED_METERS_PER_MIN));
}

function motoSecondsFromDriving(drivingSeconds: number): number {
  return Math.max(60, Math.round(drivingSeconds * MOTO_ETA_FACTOR));
}

/**
 * One-shot delivery ETA when the order goes OUT_FOR_DELIVERY.
 * Uses Google Routes (DRIVE + traffic) × MOTO_ETA_FACTOR, with distance/speed fallbacks.
 */
export async function computeDeliveryEta(params: {
  shop: {
    latitude: number | null;
    longitude: number | null;
    deliveryPrepMinutes?: number;
  };
  delivery: { lat: number | null; lng: number | null };
  distanceMeters?: number | null;
  departAt?: Date;
}): Promise<DeliveryEtaResult | null> {
  const departAt = params.departAt ?? new Date();

  let motoSeconds: number | null = null;

  if (
    params.shop.latitude != null &&
    params.shop.longitude != null &&
    params.delivery.lat != null &&
    params.delivery.lng != null
  ) {
    const drivingSeconds = await fetchRoutesDrivingSeconds(
      { lat: params.shop.latitude, lng: params.shop.longitude },
      { lat: params.delivery.lat, lng: params.delivery.lng },
      departAt,
    );
    if (drivingSeconds != null) {
      motoSeconds = motoSecondsFromDriving(drivingSeconds);
    }
  }

  if (motoSeconds == null) {
    const dist =
      params.distanceMeters ??
      (params.shop.latitude != null &&
      params.shop.longitude != null &&
      params.delivery.lat != null &&
      params.delivery.lng != null
        ? distanceMeters(
            { lat: params.shop.latitude, lng: params.shop.longitude },
            { lat: params.delivery.lat, lng: params.delivery.lng },
          )
        : null);

    if (dist != null && dist > 0) {
      motoSeconds = fallbackMotoMinutes(dist) * 60;
    }
  }

  if (motoSeconds == null) {
    const fallbackMin = Math.max(5, Math.round((params.shop.deliveryPrepMinutes ?? 30) * 0.4));
    motoSeconds = fallbackMin * 60;
  }

  const etaMinutes = Math.max(1, Math.round(motoSeconds / 60));
  const estimatedArrivalAt = new Date(departAt.getTime() + motoSeconds * 1000);

  return { estimatedArrivalAt, etaMinutes };
}
