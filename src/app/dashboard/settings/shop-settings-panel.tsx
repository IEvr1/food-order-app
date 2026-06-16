"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  APIProvider,
  AdvancedMarker,
  Map,
  MapMouseEvent,
} from "@vis.gl/react-google-maps";
import { updateShopDeliverySettings } from "@/app/dashboard/order-actions";
import { parseLocale, type Locale } from "@/lib/locale";
import {
  defaultShopHours,
  formatShopHour,
  type ShopHourEntry,
  WEEKDAY_DISPLAY_ORDER,
  weekdayLabels,
} from "@/lib/shop-hours";

type DayHoursState = {
  weekday: number;
  open: boolean;
  startHour: number;
  endHour: number;
};

function buildDayStates(hours: ShopHourEntry[]): DayHoursState[] {
  const defaults = defaultShopHours();
  return WEEKDAY_DISPLAY_ORDER.map((weekday) => {
    const row = hours.find((h) => h.weekday === weekday);
    const fallback = defaults.find((d) => d.weekday === weekday)!;
    return {
      weekday,
      open: Boolean(row),
      startHour: row?.startHour ?? fallback.startHour,
      endHour: row?.endHour ?? fallback.endHour,
    };
  });
}

function dayStatesToEntries(days: DayHoursState[]): ShopHourEntry[] {
  return days
    .filter((d) => d.open && d.endHour > d.startHour)
    .map((d) => ({
      weekday: d.weekday,
      startHour: d.startHour,
      endHour: d.endHour,
    }));
}

function DayHoursList({
  dayHours,
  labels,
  lang,
  t,
  hourOptions,
  endHourOptions,
  onUpdateDay,
}: {
  dayHours: DayHoursState[];
  labels: Record<number, string>;
  lang: Locale;
  t: { open: string; from: string; until: string; closed: string };
  hourOptions: number[];
  endHourOptions: number[];
  onUpdateDay: (weekday: number, patch: Partial<DayHoursState>) => void;
}) {
  return (
    <ul className="mt-4 space-y-3">
      {dayHours.map((day) => {
        const invalid = day.open && day.endHour <= day.startHour;
        return (
          <li
            key={day.weekday}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-white px-3 py-2 ring-1 ring-zinc-200"
          >
            <span className="min-w-[5.5rem] text-sm font-medium text-zinc-900">
              {labels[day.weekday]}
            </span>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={day.open}
                onChange={(e) => onUpdateDay(day.weekday, { open: e.target.checked })}
                className="rounded border-zinc-300"
              />
              {t.open}
            </label>
            {day.open ? (
              <>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500">{t.from}</span>
                  <select
                    value={day.startHour}
                    onChange={(e) =>
                      onUpdateDay(day.weekday, { startHour: Number(e.target.value) })
                    }
                    className="rounded-lg border border-zinc-300 px-2 py-1"
                  >
                    {hourOptions.map((h) => (
                      <option key={h} value={h}>
                        {formatShopHour(h, lang)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-zinc-500">{t.until}</span>
                  <select
                    value={day.endHour}
                    onChange={(e) =>
                      onUpdateDay(day.weekday, { endHour: Number(e.target.value) })
                    }
                    className={`rounded-lg border px-2 py-1 ${invalid ? "border-red-400" : "border-zinc-300"}`}
                  >
                    {endHourOptions.map((h) => (
                      <option key={h} value={h} disabled={h <= day.startHour}>
                        {formatShopHour(h, lang)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <span className="text-sm text-zinc-400">{t.closed}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

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
    hours: ShopHourEntry[];
    deliveryHours: ShopHourEntry[];
  };
}) {
  const t =
    lang === "el"
      ? {
          title: "Ρυθμίσεις καταστήματος",
          prepSection: "Χρόνοι εκτίμησης",
          prepPickup: "TakeAway (λεπτά)",
          prepDelivery: "Delivery (λεπτά)",
          prepHint: "Εμφανίζονται στον πελάτη κατά την παραγγελία.",
          deliveryHoursSection: "Ωράριο delivery",
          deliveryHoursHint: "Ημέρες και ώρες που δέχεστε παραγγελίες delivery.",
          hoursSection: "Ωράριο παραλαβής",
          hoursHint: "Ημέρες και ώρες για παραγγελίες take away (ώρα λήξης = κλείσιμο).",
          open: "Ανοιχτό",
          from: "Από",
          until: "Έως",
          closed: "Κλειστό",
          location: "Θέση καταστήματος",
          radius: "Ακτίνα delivery (km)",
          save: "Αποθήκευση",
          saved: "Αποθηκεύτηκε!",
          back: "Πίσω",
          hint: "Σύρετε την καρφίτσα στο κατάστημα και ορίστε την ακτίνα delivery.",
          hoursError: "Η ώρα λήξης πρέπει να είναι μετά την ώρα έναρξης.",
        }
      : {
          title: "Shop settings",
          prepSection: "Estimated times",
          prepPickup: "Pickup (minutes)",
          prepDelivery: "Delivery (minutes)",
          prepHint: "Shown to customers when ordering.",
          deliveryHoursSection: "Delivery hours",
          deliveryHoursHint: "Days and hours when you accept delivery orders.",
          hoursSection: "Pickup hours",
          hoursHint: "Days and hours for take-away orders (closing time = end hour).",
          open: "Open",
          from: "From",
          until: "Until",
          closed: "Closed",
          location: "Shop location",
          radius: "Delivery radius (km)",
          save: "Save",
          saved: "Saved!",
          back: "Back",
          hint: "Drag the pin to your shop and set the delivery radius.",
          hoursError: "Closing time must be after opening time.",
        };

  const labels = useMemo(() => weekdayLabels(lang), [lang]);
  const hourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, i) => i),
    [],
  );
  const endHourOptions = useMemo(
    () => Array.from({ length: 24 }, (_, i) => i + 1),
    [],
  );

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const defaultLat = shop.latitude ?? 35.1856;
  const defaultLng = shop.longitude ?? 33.3823;
  const [lat, setLat] = useState(defaultLat);
  const [lng, setLng] = useState(defaultLng);
  const [radiusKm, setRadiusKm] = useState((shop.deliveryRadiusMeters / 1000) || 3);
  const [prepMinutes, setPrepMinutes] = useState(shop.prepMinutes);
  const [deliveryPrepMinutes, setDeliveryPrepMinutes] = useState(shop.deliveryPrepMinutes);
  const [dayHours, setDayHours] = useState<DayHoursState[]>(() => buildDayStates(shop.hours));
  const [deliveryDayHours, setDeliveryDayHours] = useState<DayHoursState[]>(() =>
    buildDayStates(shop.deliveryHours),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const updateDay = (weekday: number, patch: Partial<DayHoursState>) => {
    setDayHours((prev) =>
      prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)),
    );
  };

  const updateDeliveryDay = (weekday: number, patch: Partial<DayHoursState>) => {
    setDeliveryDayHours((prev) =>
      prev.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)),
    );
  };

  const hoursValid =
    dayHours.every((d) => !d.open || d.endHour > d.startHour) &&
    deliveryDayHours.every((d) => !d.open || d.endHour > d.startHour);

  const save = () => {
    if (!hoursValid) {
      setMessage(t.hoursError);
      return;
    }
    startTransition(async () => {
      const result = await updateShopDeliverySettings({
        latitude: lat,
        longitude: lng,
        deliveryRadiusKm: radiusKm,
        prepMinutes,
        deliveryPrepMinutes,
        hours: dayStatesToEntries(dayHours),
        deliveryHours: dayStatesToEntries(deliveryDayHours),
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

      <section className="mt-6 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <h2 className="text-sm font-semibold text-zinc-900">{t.deliveryHoursSection}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t.deliveryHoursHint}</p>
        <DayHoursList
          dayHours={deliveryDayHours}
          labels={labels}
          lang={lang}
          t={t}
          hourOptions={hourOptions}
          endHourOptions={endHourOptions}
          onUpdateDay={updateDeliveryDay}
        />
      </section>

      <section className="mt-6 rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200">
        <h2 className="text-sm font-semibold text-zinc-900">{t.hoursSection}</h2>
        <p className="mt-1 text-xs text-zinc-500">{t.hoursHint}</p>
        <DayHoursList
          dayHours={dayHours}
          labels={labels}
          lang={lang}
          t={t}
          hourOptions={hourOptions}
          endHourOptions={endHourOptions}
          onUpdateDay={updateDay}
        />
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
        disabled={pending || !hoursValid}
        onClick={save}
        className="mt-6 w-full rounded-xl bg-orange-600 py-3 font-semibold text-white disabled:opacity-50"
      >
        {t.save}
      </button>
      {message && (
        <p
          className={`mt-2 text-sm ${message === t.saved ? "text-emerald-700" : "text-red-700"}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
