"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  APIProvider,
  AdvancedMarker,
  Map,
  MapMouseEvent,
} from "@vis.gl/react-google-maps";
import { updateShopDeliverySettings } from "@/app/dashboard/order-actions";
import { parseLocale, type Locale } from "@/lib/locale";

export function ShopSettingsPanel({
  lang,
  shop,
}: {
  lang: Locale;
  shop: {
    name: string;
    latitude: number | null;
    longitude: number | null;
    deliveryRadiusMeters: number;
    prepMinutes: number;
    deliveryPrepMinutes: number;
  };
}) {
  const t =
    lang === "el"
      ? {
          title: "Ρυθμίσεις καταστήματος",
          prepSection: "Χρόνοι εκτίμησης",
          prepPickup: "Παραλαβή (λεπτά)",
          prepDelivery: "Delivery (λεπτά)",
          prepHint: "Εμφανίζονται στον πελάτη κατά την παραγγελία.",
          location: "Θέση καταστήματος",
          radius: "Ακτίνα delivery (km)",
          save: "Αποθήκευση",
          saved: "Αποθηκεύτηκε!",
          back: "Πίσω",
          hint: "Σύρετε την καρφίτσα στο κατάστημα και ορίστε την ακτίνα delivery.",
        }
      : {
          title: "Shop settings",
          prepSection: "Estimated times",
          prepPickup: "Pickup (minutes)",
          prepDelivery: "Delivery (minutes)",
          prepHint: "Shown to customers when ordering.",
          location: "Shop location",
          radius: "Delivery radius (km)",
          save: "Save",
          saved: "Saved!",
          back: "Back",
          hint: "Drag the pin to your shop and set the delivery radius.",
        };

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const defaultLat = shop.latitude ?? 35.1856;
  const defaultLng = shop.longitude ?? 33.3823;
  const [lat, setLat] = useState(defaultLat);
  const [lng, setLng] = useState(defaultLng);
  const [radiusKm, setRadiusKm] = useState((shop.deliveryRadiusMeters / 1000) || 3);
  const [prepMinutes, setPrepMinutes] = useState(shop.prepMinutes);
  const [deliveryPrepMinutes, setDeliveryPrepMinutes] = useState(shop.deliveryPrepMinutes);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await updateShopDeliverySettings({
        latitude: lat,
        longitude: lng,
        deliveryRadiusKm: radiusKm,
        prepMinutes,
        deliveryPrepMinutes,
        lang,
      });
      setMessage(result.ok ? t.saved : "Error");
    });
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href={`/dashboard?lang=${lang}`} className="text-sm text-orange-600 underline">
        ← {t.back}
      </Link>
      <h1 className="mt-4 text-2xl font-bold">{t.title}</h1>
      <p className="mt-1 text-sm text-zinc-600">{shop.name}</p>

      <section className="mt-6 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <h2 className="text-sm font-semibold text-zinc-900">{t.prepSection}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t.prepHint}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            {t.prepPickup}
            <input
              type="number"
              min={5}
              max={180}
              step={1}
              value={prepMinutes}
              onChange={(e) => setPrepMinutes(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm font-medium">
            {t.prepDelivery}
            <input
              type="number"
              min={5}
              max={180}
              step={1}
              value={deliveryPrepMinutes}
              onChange={(e) => setDeliveryPrepMinutes(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
            />
          </label>
        </div>
      </section>

      <p className="mt-6 text-sm text-zinc-600">{t.hint}</p>

      <label className="mt-4 block text-sm font-medium">
        {t.radius}
        <input
          type="number"
          min={0}
          max={15}
          step={0.5}
          value={radiusKm}
          onChange={(e) => setRadiusKm(Number(e.target.value))}
          className="mt-1 w-full rounded-xl border border-zinc-300 px-3 py-2"
        />
      </label>

      {apiKey ? (
        <div className="mt-4 h-72 overflow-hidden rounded-xl border border-zinc-200">
          <APIProvider apiKey={apiKey}>
            <Map
              defaultCenter={{ lat, lng }}
              defaultZoom={14}
              gestureHandling="greedy"
              mapId="shop-settings"
              onClick={(e: MapMouseEvent) => {
                const ll = e.detail.latLng;
                if (ll) {
                  setLat(ll.lat);
                  setLng(ll.lng);
                }
              }}
            >
              <AdvancedMarker
                position={{ lat, lng }}
                draggable
                onDragEnd={(e) => {
                  const ll = e.latLng;
                  if (ll) {
                    setLat(ll.lat());
                    setLng(ll.lng());
                  }
                }}
              />
            </Map>
          </APIProvider>
        </div>
      ) : (
        <p className="mt-4 text-sm text-amber-800">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY required</p>
      )}

      <p className="mt-2 text-xs text-zinc-500">
        {lat.toFixed(5)}, {lng.toFixed(5)}
      </p>

      <button
        type="button"
        disabled={pending}
        onClick={save}
        className="mt-6 w-full rounded-xl bg-orange-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        {t.save}
      </button>
      {message && <p className="mt-2 text-sm text-emerald-700">{message}</p>}
    </div>
  );
}
