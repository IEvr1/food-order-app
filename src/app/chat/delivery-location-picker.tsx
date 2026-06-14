"use client";

import { useCallback, useEffect, useState } from "react";
import {
  APIProvider,
  AdvancedMarker,
  Map,
  MapMouseEvent,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";
import type { Locale } from "@/lib/locale";

export type DeliveryLocation = {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
};

type Props = {
  locale: Locale;
  shopLat: number;
  shopLng: number;
  maxRadiusMeters: number;
  initial?: DeliveryLocation | null;
  onConfirm: (location: DeliveryLocation) => void;
  onCancel?: () => void;
};

function formatRadiusKm(meters: number): string {
  return (meters / 1000).toFixed(1);
}

function AddressSearch({
  locale,
  onSelect,
}: {
  locale: Locale;
  onSelect: (loc: DeliveryLocation) => void;
}) {
  const places = useMapsLibrary("places");
  const [input, setInput] = useState("");
  const [predictions, setPredictions] = useState<google.maps.places.AutocompletePrediction[]>([]);
  const [sessionToken, setSessionToken] = useState<google.maps.places.AutocompleteSessionToken | null>(
    null,
  );

  useEffect(() => {
    if (places && !sessionToken) {
      setSessionToken(new places.AutocompleteSessionToken());
    }
  }, [places, sessionToken]);

  const search = useCallback(
    (value: string) => {
      setInput(value);
      if (!places || value.length < 3) {
        setPredictions([]);
        return;
      }
      const service = new places.AutocompleteService();
      service.getPlacePredictions(
        {
          input: value,
          componentRestrictions: { country: "cy" },
          sessionToken: sessionToken ?? undefined,
        },
        (results) => setPredictions(results ?? []),
      );
    },
    [places, sessionToken],
  );

  const pick = useCallback(
    (placeId: string, description: string) => {
      if (!places) return;
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ placeId }, (results, status) => {
        if (status !== "OK" || !results?.[0]?.geometry?.location) return;
        const loc = results[0].geometry.location;
        onSelect({
          address: description,
          lat: loc.lat(),
          lng: loc.lng(),
          placeId,
        });
        setInput(description);
        setPredictions([]);
      });
    },
    [onSelect, places],
  );

  const placeholder =
    locale === "el" ? "Αναζήτηση διεύθυνσης..." : "Search address...";

  return (
    <div className="relative">
      <input
        type="text"
        value={input}
        onChange={(e) => search(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
      />
      {predictions.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-xl border border-zinc-200 bg-white shadow-lg">
          {predictions.map((p) => (
            <li key={p.place_id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-orange-50"
                onClick={() => pick(p.place_id, p.description)}
              >
                {p.description}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PickerInner({
  locale,
  shopLat,
  shopLng,
  maxRadiusMeters,
  initial,
  onConfirm,
}: Props) {
  const t =
    locale === "el"
      ? {
          hint: "Σύρετε την καρφίτσα ή αναζητήστε τη διεύθυνσή σας.",
          useMyLocation: "Χρήση τρέχουσας θέσης",
          confirm: "Επιβεβαιώνω αυτή τη διεύθυνση",
          validating: "Έλεγχος...",
          outOfZone: "Δεν παραδίδουμε σε αυτή την περιοχή.",
          zoneOk: "Εντός ζώνης delivery",
          radius: "Ακτίνα",
        }
      : {
          hint: "Drag the pin or search for your address.",
          useMyLocation: "Use my current location",
          confirm: "Confirm this address",
          validating: "Checking...",
          outOfZone: "We do not deliver to this area.",
          zoneOk: "Within delivery zone",
          radius: "Radius",
        };

  const [location, setLocation] = useState<DeliveryLocation | null>(
    initial ??
      ({
        address: "",
        lat: shopLat,
        lng: shopLng,
      } as DeliveryLocation),
  );
  const [zoneOk, setZoneOk] = useState<boolean | null>(null);
  const [distanceMeters, setDistanceMeters] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(
    async (loc: DeliveryLocation) => {
      setChecking(true);
      setError(null);
      try {
        const res = await fetch("/api/orders/validate-delivery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: loc.lat, lng: loc.lng }),
        });
        const data = await res.json();
        if (data.ok) {
          setZoneOk(true);
          setDistanceMeters(data.distanceMeters);
        } else {
          setZoneOk(false);
          setDistanceMeters(data.distanceMeters ?? null);
          setError(data.error === "OUT_OF_DELIVERY_ZONE" ? t.outOfZone : t.outOfZone);
        }
      } catch {
        setZoneOk(false);
        setError(t.outOfZone);
      } finally {
        setChecking(false);
      }
    },
    [t.outOfZone],
  );

  useEffect(() => {
    if (location && location.address) {
      void validate(location);
    }
  }, [location?.lat, location?.lng, location?.address, validate]);

  const onMapClick = (e: MapMouseEvent) => {
    const latLng = e.detail.latLng;
    if (!latLng) return;
    setLocation((prev) => ({
      address: prev?.address || `${latLng.lat.toFixed(5)}, ${latLng.lng.toFixed(5)}`,
      lat: latLng.lat,
      lng: latLng.lng,
      placeId: prev?.placeId,
    }));
  };

  const useGeolocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      setLocation({
        address:
          locale === "el"
            ? `Η θέση μου (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`
            : `My location (${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)})`,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    });
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">{t.hint}</p>
      <AddressSearch locale={locale} onSelect={setLocation} />
      <button
        type="button"
        onClick={useGeolocation}
        className="text-sm font-medium text-orange-600 underline-offset-2 hover:underline"
      >
        {t.useMyLocation}
      </button>
      <div className="h-56 overflow-hidden rounded-xl border border-zinc-200">
        <Map
          defaultCenter={{ lat: shopLat, lng: shopLng }}
          defaultZoom={14}
          gestureHandling="greedy"
          disableDefaultUI
          onClick={onMapClick}
          mapId="delivery-picker"
        >
          {location && (
            <AdvancedMarker
              position={{ lat: location.lat, lng: location.lng }}
              draggable
              onDragEnd={(e) => {
                const latLng = e.latLng;
                if (!latLng) return;
                setLocation((prev) => ({
                  address: prev?.address ?? "",
                  lat: latLng.lat(),
                  lng: latLng.lng(),
                  placeId: prev?.placeId,
                }));
              }}
            />
          )}
        </Map>
      </div>
      {location?.address && (
        <p className="text-sm text-zinc-700">{location.address}</p>
      )}
      {checking && <p className="text-sm text-zinc-500">{t.validating}</p>}
      {zoneOk === true && distanceMeters != null && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {t.zoneOk} ({(distanceMeters / 1000).toFixed(1)} km / {formatRadiusKm(maxRadiusMeters)} km)
        </p>
      )}
      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      )}
      <button
        type="button"
        disabled={!location?.address || !zoneOk || checking}
        onClick={() => location && onConfirm(location)}
        className="w-full rounded-xl bg-orange-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
      >
        {t.confirm}
      </button>
    </div>
  );
}

export function DeliveryLocationPicker(props: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
        {props.locale === "el"
          ? "Ο χάρτης δεν είναι ρυθμισμένος (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)."
          : "Maps not configured (NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)."}
      </p>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <PickerInner {...props} />
    </APIProvider>
  );
}
