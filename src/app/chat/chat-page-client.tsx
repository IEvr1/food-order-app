"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DeliveryLocationPicker,
  type DeliveryLocation,
} from "@/app/chat/delivery-location-picker";
import { DashboardNexalplaLogo } from "@/app/dashboard/dashboard-nexalpla-logo";
import { formatPriceEuros } from "@/lib/order";
import { calculateRestaurantOrderVat, formatVatLabel } from "@/lib/vat";
import { normalizePhone } from "@/lib/phone";
import { parseLocale, type Locale } from "@/lib/locale";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
};

type MenuCategory = {
  id: string;
  name: string;
  items: MenuItem[];
};

type ShopInfo = {
  id: string;
  name: string;
  timezone: string;
  deliveryEnabled: boolean;
  deliveryOpenNow?: boolean;
  latitude: number | null;
  longitude: number | null;
  deliveryRadiusMeters: number;
  prepMinutes: number;
  deliveryPrepMinutes: number;
};

type CartLine = { menuItemId: string; name: string; priceCents: number; quantity: number };

type OrderSummaryItem = {
  name: string;
  priceCents: number;
  quantity: number;
  lineTotalCents: number;
};

type ManageOrder = {
  id: string;
  orderNumber: number;
  requestedAtDisplay: string;
  status: string;
  fulfillmentType: string;
  deliveryAddress: string | null;
  totalDisplay: string;
  items: OrderSummaryItem[];
  uiPhase: string;
  canManage: boolean;
  manageUntil?: string;
  manageUntilDisplay?: string;
  notes: string | null;
  estimatedArrivalDisplay?: string | null;
  etaMinutes?: number | null;
};

type ManageSummary = {
  shopName: string;
  order: ManageOrder | null;
  uiPhase: string;
  canManage: boolean;
  linkIntent?: "manage" | "view" | "reorder";
  activeOrders: ManageOrder[];
  orderHistory: ManageOrder[];
};

type Step = "menu" | "checkout" | "success" | "manage";

type TimeSlot = { iso: string; label: string; time: string };

function cartTotal(lines: CartLine[]) {
  return lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
}

function cartItemCount(lines: CartLine[]) {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

function cartQty(lines: CartLine[], menuItemId: string) {
  return lines.find((l) => l.menuItemId === menuItemId)?.quantity ?? 0;
}

function cartSummaryText(lines: CartLine[], locale: Locale, maxItems = 3) {
  const parts = lines.slice(0, maxItems).map((l) => `${l.quantity}× ${l.name}`);
  const remaining = lines.length - maxItems;
  if (remaining > 0) {
    parts.push(locale === "el" ? `+${remaining} ακόμη` : `+${remaining} more`);
  }
  return parts.join(", ");
}

export function ChatPageClient({ initialLocale }: { initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const t =
    locale === "el"
      ? {
          welcome: "Καλώς ήρθατε! Τι θα θέλατε να παραγγείλετε;",
          cart: "Καλάθι",
          itemCount: (n: number) => (n === 1 ? "1 προϊόν" : `${n} προϊόντα`),
          continue: "Συνέχεια",
          emptyCart: "Το καλάθι είναι άδειο.",
          pickup: "Παραλαβή",
          delivery: "Delivery",
          scheduled: "Προγραμματισμένη παραγγελία",
          pickDate: "Ημερομηνία",
          pickTime: "Ώρα",
          pickTimePlaceholder: "Επιλέξτε ώρα",
          noTimeSlots: "Δεν υπάρχουν διαθέσιμες ώρες για αυτή την ημερομηνία.",
          loadingTimeSlots: "Φόρτωση ωρών...",
          prepEstimate: (minutes: number) =>
            `Εκτιμώμενος χρόνος ετοιμασίας: ~${minutes} λεπτά`,
          prepEstimateDelivery: (minutes: number) =>
            `Εκτιμώμενος χρόνος παράδοσης: ~${minutes} λεπτά`,
          namePh: "Ονοματεπώνυμο",
          phonePh: "Κινητό (8 ψηφία)",
          notesPh: "Σημειώσεις (π.χ. χωρίς κρεμμύδι)",
          submit: "Υποβολή παραγγελίας",
          submitting: "Υποβολή...",
          success: "Η παραγγελία ολοκληρώθηκε!",
          orderNum: "Αριθμός",
          total: "Σύνολο",
          subtotalExVat: "Υποσύνολο (χωρίς ΦΠΑ)",
          newOrder: "Νέα παραγγελία",
          manageTitle: "Η παραγγελία σας",
          cancel: "Ακύρωση παραγγελίας",
          manageUntil: (when: string) => `Μπορείτε να αλλάξετε ή να ακυρώσετε μέχρι ${when}.`,
          manageCountdown: (time: string) => `Χρόνος για αλλαγή/ακύρωση: ${time}`,
          manageClosed:
            "Η παραγγελία επιβεβαιώθηκε. Δεν μπορεί πλέον να τροποποιηθεί ή να ακυρωθεί.",
          viewOnly: "Μπορείτε να δείτε την κατάσταση της παραγγελίας σας.",
          cancelledHint: "Η παραγγελία ακυρώθηκε. Μπορείτε να κάνετε νέα παραγγελία.",
          history: "Ιστορικό (4 τελευταίες)",
          active: "Ενεργές παραγγελίες",
          status: "Κατάσταση",
          backMenu: "Επιστροφή στο μενού",
          langLabel: "Γλώσσα",
          greek: "Ελληνικά",
          english: "English",
          privacy: "Πολιτική απορρήτου",
          failed: "Η παραγγελία απέτυχε.",
          deliveryDisabled: "Το delivery δεν είναι διαθέσιμο.",
          deliveryClosedNow: "Το delivery δεν δέχεται παραγγελίες αυτή τη στιγμή (εκτός ωραρίου).",
          deliveryNotConfigured:
            "Το delivery δεν είναι ρυθμισμένο. Ορίστε θέση, ακτίνα και ωράριο delivery στις ρυθμίσεις.",
          confirmCancel: "Να ακυρωθεί η παραγγελία;",
          yes: "Ναι",
          no: "Όχι",
          deliveryEta: (minutes: number, time: string) =>
            `Εκτιμώμενη άφιξη σε ~${minutes} λεπτά, στις ${time}.`,
          deliveryEtaTime: (time: string) => `Εκτιμώμενη άφιξη στις ${time}.`,
        }
      : {
          welcome: "Welcome! What would you like to order?",
          cart: "Cart",
          itemCount: (n: number) => (n === 1 ? "1 item" : `${n} items`),
          continue: "Continue",
          emptyCart: "Your cart is empty.",
          pickup: "Pickup",
          delivery: "Delivery",
          scheduled: "Scheduled order",
          pickDate: "Date",
          pickTime: "Time",
          pickTimePlaceholder: "Select time",
          noTimeSlots: "No available times for this date.",
          loadingTimeSlots: "Loading times...",
          prepEstimate: (minutes: number) => `Estimated preparation time: ~${minutes} min`,
          prepEstimateDelivery: (minutes: number) => `Estimated delivery time: ~${minutes} min`,
          namePh: "Full name",
          phonePh: "Mobile (8 digits)",
          notesPh: "Notes (e.g. no onion)",
          submit: "Place order",
          submitting: "Submitting...",
          success: "Order placed!",
          orderNum: "Number",
          total: "Total",
          subtotalExVat: "Subtotal (excl. VAT)",
          newOrder: "New order",
          manageTitle: "Your order",
          cancel: "Cancel order",
          manageUntil: (when: string) => `You can change or cancel until ${when}.`,
          manageCountdown: (time: string) => `Time to change or cancel: ${time}`,
          manageClosed: "Your order is confirmed and can no longer be changed or cancelled.",
          viewOnly: "You can view your order status here.",
          cancelledHint: "This order was cancelled. You can place a new order.",
          history: "History (last 4)",
          active: "Active orders",
          status: "Status",
          backMenu: "Back to menu",
          langLabel: "Language",
          greek: "Ελληνικά",
          english: "English",
          privacy: "Privacy policy",
          failed: "Order failed.",
          deliveryDisabled: "Delivery is not available.",
          deliveryClosedNow: "Delivery is not accepting orders right now (outside delivery hours).",
          deliveryNotConfigured:
            "Delivery is not set up. Configure location, radius, and delivery hours in settings.",
          confirmCancel: "Cancel this order?",
          yes: "Yes",
          no: "No",
          deliveryEta: (minutes: number, time: string) =>
            `Estimated arrival in ~${minutes} min, by ${time}.`,
          deliveryEtaTime: (time: string) => `Estimated arrival by ${time}.`,
        };

  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [step, setStep] = useState<Step>("menu");
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryLocation | null>(null);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [loadingTimeSlots, setLoadingTimeSlots] = useState(false);
  const [todayIso, setTodayIso] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<{
    number: number;
    totalCents: number;
    isScheduled: boolean;
  } | null>(null);
  const [manage, setManage] = useState<ManageSummary | null>(null);

  const localeTag = locale === "el" ? "el-GR" : "en-US";

  const checkoutVat = useMemo(
    () =>
      calculateRestaurantOrderVat(
        cart.map((line) => ({ lineTotalCents: line.priceCents * line.quantity })),
      ),
    [cart],
  );

  const estimateMinutes = useMemo(() => {
    if (!shop) return null;
    return fulfillment === "DELIVERY" ? shop.deliveryPrepMinutes : shop.prepMinutes;
  }, [shop, fulfillment]);

  const loadMenu = useCallback(async () => {
    const res = await fetch("/api/menu");
    const data = await res.json();
    setShop(data.shop);
    setCategories(data.categories);
    if (data.categories[0]) setActiveCategoryId(data.categories[0].id);
  }, []);

  const loadManage = useCallback(async () => {
    const fromLink =
      typeof window !== "undefined" &&
      new URL(window.location.href).searchParams.get("fromLink") === "1";

    const res = await fetch(`/api/orders/manage/summary?lang=${locale}`);
    if (res.status === 401) {
      setManage(null);
      if (fromLink) {
        setStep("menu");
        const url = new URL(window.location.href);
        url.searchParams.delete("fromLink");
        window.history.replaceState({}, "", url.toString());
      }
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setManage(data);
      if (data.order || data.activeOrders?.length) {
        setStep("manage");
      } else if (fromLink) {
        setStep("menu");
      }
      if (fromLink) {
        const url = new URL(window.location.href);
        url.searchParams.delete("fromLink");
        window.history.replaceState({}, "", url.toString());
      }
    }
  }, [locale]);

  useEffect(() => {
    void loadMenu();
    void loadManage();
  }, [loadMenu, loadManage]);

  useEffect(() => {
    if (step === "checkout" && shop && !todayIso) {
      void fetch("/api/orders/availability")
        .then((r) => r.json())
        .then((d) => setTodayIso(d.today ?? ""));
    }
  }, [step, shop, todayIso]);

  useEffect(() => {
    if (!isScheduled || !scheduleDate) {
      setTimeSlots([]);
      setScheduleTime("");
      return;
    }

    let cancelled = false;
    setLoadingTimeSlots(true);

    void fetch(
      `/api/orders/availability?date=${encodeURIComponent(scheduleDate)}&fulfillmentType=${fulfillment}&lang=${locale}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const slots: TimeSlot[] = d.slots ?? [];
        setTimeSlots(slots);
        setScheduleTime((prev) =>
          slots.some((slot) => slot.time === prev) ? prev : (slots[0]?.time ?? ""),
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingTimeSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isScheduled, scheduleDate, fulfillment, locale]);

  const activeCategory = useMemo(
    () => categories.find((c) => c.id === activeCategoryId) ?? categories[0],
    [categories, activeCategoryId],
  );

  const addToCart = (item: MenuItem) => {
    setCart((prev) => {
      const existing = prev.find((l) => l.menuItemId === item.id);
      if (existing) {
        return prev.map((l) =>
          l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { menuItemId: item.id, name: item.name, priceCents: item.priceCents, quantity: 1 }];
    });
  };

  const changeQty = (menuItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  const submitOrder = async () => {
    setLoading(true);
    setError(null);
    try {
      normalizePhone(phone);
    } catch {
      setError(locale === "el" ? "Μη έγκυρο τηλέφωνο." : "Invalid phone.");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        fulfillmentType: fulfillment,
        timing: isScheduled ? "SCHEDULED" : "ASAP",
        scheduledDate: isScheduled ? scheduleDate : undefined,
        scheduledTime: isScheduled ? scheduleTime : undefined,
        name,
        phone,
        notes: notes || undefined,
        deliveryAddress: deliveryLocation?.address,
        deliveryLat: deliveryLocation?.lat,
        deliveryLng: deliveryLocation?.lng,
        deliveryPlaceId: deliveryLocation?.placeId,
        lang: locale,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? t.failed);
      setLoading(false);
      return;
    }

    setSuccessOrder({
      number: data.orderNumber,
      totalCents: data.totalCents,
      isScheduled,
    });
    setCart([]);
    setStep("success");
    setLoading(false);
    void loadManage();
  };

  const cancelOrder = async () => {
    if (!confirm(t.confirmCancel)) return;
    const res = await fetch(`/api/orders/manage/cancel?lang=${locale}`, { method: "POST" });
    if (res.ok) void loadManage();
  };

  const switchLang = (next: Locale) => {
    setLocale(next);
    const url = new URL(window.location.href);
    url.searchParams.set("lang", next);
    window.history.replaceState({}, "", url.toString());
  };

  const statusLabel = (status: string) => {
    const map: Record<string, Record<Locale, string>> = {
      CONFIRMED: { el: "Επιβεβαιωμένη", en: "Confirmed" },
      PREPARING: { el: "Σε προετοιμασία", en: "Preparing" },
      READY: { el: "Έτοιμη", en: "Ready" },
      OUT_FOR_DELIVERY: { el: "Στο δρόμο", en: "On the way" },
      COMPLETED: { el: "Ολοκληρώθηκε", en: "Completed" },
      CANCELLED: { el: "Ακυρώθηκε", en: "Cancelled" },
    };
    return map[status]?.[locale] ?? status;
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-gradient-to-b from-orange-50/80 to-white">
      <header className="sticky top-0 z-10 border-b border-orange-100 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-bold text-zinc-900">{shop?.name ?? "..."}</h1>
            <p className="text-xs text-zinc-500">{t.welcome}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => switchLang("el")}
                className={locale === "el" ? "font-bold text-orange-600" : "text-zinc-500"}
              >
                EL
              </button>
              <span className="text-zinc-300">|</span>
              <button
                type="button"
                onClick={() => switchLang("en")}
                className={locale === "en" ? "font-bold text-orange-600" : "text-zinc-500"}
              >
                EN
              </button>
            </div>
            <DashboardNexalplaLogo />
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-36">
        {step === "menu" && (
          <>
            <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCategoryId(c.id)}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium ${
                    activeCategoryId === c.id
                      ? "bg-orange-600 text-white"
                      : "bg-white text-zinc-700 ring-1 ring-zinc-200"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {activeCategory?.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-zinc-900">{item.name}</p>
                    {item.description && (
                      <p className="text-sm text-zinc-500">{item.description}</p>
                    )}
                    <p className="mt-1 text-sm font-medium text-orange-600">
                      {formatPriceEuros(item.priceCents, localeTag)}
                    </p>
                  </div>
                  {cartQty(cart, item.id) > 0 ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() => changeQty(item.id, -1)}
                        className="h-9 w-9 rounded-lg bg-zinc-100 text-lg font-medium"
                        aria-label={`${item.name} −`}
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-semibold text-zinc-900">
                        {cartQty(cart, item.id)}
                      </span>
                      <button
                        type="button"
                        onClick={() => addToCart(item)}
                        className="h-9 w-9 rounded-lg bg-orange-100 text-lg font-medium text-orange-700"
                        aria-label={`${item.name} +`}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => addToCart(item)}
                      className="shrink-0 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
                      aria-label={`${item.name} +`}
                    >
                      +
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {step === "checkout" && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t.cart}</h2>
            {cart.map((line) => (
              <div key={line.menuItemId} className="flex items-center justify-between rounded-xl bg-white p-3 ring-1 ring-zinc-200">
                <div>
                  <p className="font-medium">{line.name}</p>
                  <p className="text-sm text-zinc-500">
                    {formatPriceEuros(line.priceCents, localeTag)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => changeQty(line.menuItemId, -1)} className="h-8 w-8 rounded-lg bg-zinc-100">−</button>
                  <span>{line.quantity}</span>
                  <button type="button" onClick={() => changeQty(line.menuItemId, 1)} className="h-8 w-8 rounded-lg bg-orange-100 text-orange-700">+</button>
                </div>
              </div>
            ))}
            <div className="rounded-xl bg-zinc-50 p-3 text-sm ring-1 ring-zinc-200">
              <div className="flex justify-between text-zinc-600">
                <span>{t.subtotalExVat}</span>
                <span>{formatPriceEuros(checkoutVat.netCents, localeTag)}</span>
              </div>
              {checkoutVat.groups.map((group) => (
                <div key={group.rateBps} className="flex justify-between text-zinc-600">
                  <span>{formatVatLabel(group.rateBps, locale)}</span>
                  <span>{formatPriceEuros(group.vatCents, localeTag)}</span>
                </div>
              ))}
              <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 font-bold text-zinc-900">
                <span>{t.total}</span>
                <span>{formatPriceEuros(checkoutVat.grossCents, localeTag)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFulfillment("PICKUP")}
                className={`flex-1 rounded-xl py-3 text-sm font-semibold ${fulfillment === "PICKUP" ? "bg-orange-600 text-white" : "bg-white ring-1 ring-zinc-200"}`}
              >
                {t.pickup}
              </button>
              <button
                type="button"
                disabled={!shop?.deliveryEnabled}
                onClick={() => setFulfillment("DELIVERY")}
                className={`flex-1 rounded-xl py-3 text-sm font-semibold disabled:opacity-40 ${fulfillment === "DELIVERY" ? "bg-orange-600 text-white" : "bg-white ring-1 ring-zinc-200"}`}
              >
                {t.delivery}
              </button>
            </div>
            {!shop?.deliveryEnabled && (
              <p className="text-xs text-amber-700">{t.deliveryNotConfigured}</p>
            )}
            {shop?.deliveryEnabled && shop.deliveryOpenNow === false && !isScheduled && (
              <p className="text-xs text-amber-700">{t.deliveryClosedNow}</p>
            )}

            {!isScheduled && estimateMinutes != null && (
              <p className="rounded-xl bg-orange-50 px-3 py-2.5 text-sm text-orange-900 ring-1 ring-orange-100">
                {fulfillment === "DELIVERY"
                  ? t.prepEstimateDelivery(estimateMinutes)
                  : t.prepEstimate(estimateMinutes)}
              </p>
            )}

            {fulfillment === "DELIVERY" && shop?.latitude != null && shop.longitude != null && (
              <DeliveryLocationPicker
                locale={locale}
                shopLat={shop.latitude}
                shopLng={shop.longitude}
                maxRadiusMeters={shop.deliveryRadiusMeters}
                initial={deliveryLocation}
                onConfirm={setDeliveryLocation}
              />
            )}

            <div>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-white px-3 py-3 ring-1 ring-zinc-200">
                <input
                  type="checkbox"
                  checked={isScheduled}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsScheduled(checked);
                    if (!checked) {
                      setScheduleDate("");
                      setScheduleTime("");
                      setTimeSlots([]);
                    }
                  }}
                  className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-500"
                />
                <span className="text-sm font-medium text-zinc-800">{t.scheduled}</span>
              </label>

              {isScheduled && (
                <div className="mt-2 space-y-2 rounded-xl bg-orange-50/50 p-3 ring-1 ring-orange-100">
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t.pickDate}</label>
                    <input
                      type="date"
                      value={scheduleDate}
                      min={todayIso || undefined}
                      onChange={(e) => setScheduleDate(e.target.value)}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium">{t.pickTime}</label>
                    <select
                      value={scheduleTime}
                      onChange={(e) => setScheduleTime(e.target.value)}
                      disabled={!scheduleDate || loadingTimeSlots || timeSlots.length === 0}
                      className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-400"
                    >
                      {!scheduleDate ? (
                        <option value="">{t.pickTimePlaceholder}</option>
                      ) : loadingTimeSlots ? (
                        <option value="">{t.loadingTimeSlots}</option>
                      ) : timeSlots.length === 0 ? (
                        <option value="">{t.noTimeSlots}</option>
                      ) : (
                        timeSlots.map((slot) => (
                          <option key={slot.iso} value={slot.time}>
                            {slot.label}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePh}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t.phonePh}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm"
            />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.notesPh}
              rows={2}
              className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-sm"
            />

            {error && <p className="text-sm text-red-600">{error}</p>}

            <button
              type="button"
              disabled={
                loading ||
                (isScheduled && (!scheduleDate || !scheduleTime)) ||
                cart.length === 0 ||
                (fulfillment === "DELIVERY" && !deliveryLocation) ||
                (fulfillment === "DELIVERY" &&
                  !isScheduled &&
                  shop?.deliveryEnabled === true &&
                  shop.deliveryOpenNow === false)
              }
              onClick={() => void submitOrder()}
              className="w-full rounded-xl bg-orange-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {loading ? t.submitting : t.submit}
            </button>
            <button
              type="button"
              onClick={() => setStep("menu")}
              className="w-full rounded-xl border border-orange-200 bg-orange-50 py-3 text-sm font-semibold text-orange-700"
            >
              {t.backMenu}
            </button>
          </div>
        )}

        {step === "success" && successOrder && (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-orange-100">
            <p className="text-2xl">✓</p>
            <h2 className="mt-2 text-xl font-bold text-zinc-900">{t.success}</h2>
            <p className="mt-2 text-zinc-600">
              {t.orderNum}: #{successOrder.number}
            </p>
            <p className="font-semibold text-orange-600">
              {formatPriceEuros(successOrder.totalCents, localeTag)}
            </p>
            {!successOrder.isScheduled && estimateMinutes != null && (
              <p className="mt-3 text-sm text-zinc-600">
                {fulfillment === "DELIVERY"
                  ? t.prepEstimateDelivery(estimateMinutes)
                  : t.prepEstimate(estimateMinutes)}
              </p>
            )}
            <p className="mt-4 text-sm text-zinc-500">
              {locale === "el" ? "Θα λάβετε SMS επιβεβαίωσης." : "You will receive a confirmation SMS."}
            </p>
            <button
              type="button"
              onClick={() => {
                setStep("menu");
                setSuccessOrder(null);
              }}
              className="mt-6 w-full rounded-xl bg-orange-600 py-3 font-semibold text-white"
            >
              {t.newOrder}
            </button>
          </div>
        )}

        {step === "manage" && manage && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">{t.manageTitle}</h2>
            {manage.order && manage.linkIntent === "view" && (
              <p className="rounded-xl bg-blue-50 px-3 py-2.5 text-sm text-blue-900 ring-1 ring-blue-100">
                {manage.order.status === "CONFIRMED" || manage.order.status === "PENDING"
                  ? t.manageClosed
                  : t.viewOnly}
              </p>
            )}
            {manage.order && manage.linkIntent === "reorder" && manage.order.status === "CANCELLED" && (
              <p className="rounded-xl bg-zinc-50 px-3 py-2.5 text-sm text-zinc-700 ring-1 ring-zinc-200">
                {t.cancelledHint}
              </p>
            )}
            {manage.order && manage.order.canManage && manage.order.manageUntil && (
              <ManageCountdown
                manageUntil={manage.order.manageUntil}
                label={t.manageCountdown}
                locale={locale}
                deadlineDisplay={
                  manage.order.manageUntilDisplay
                    ? t.manageUntil(manage.order.manageUntilDisplay)
                    : undefined
                }
                onExpired={() => void loadManage()}
              />
            )}
            {manage.order && (
              <OrderCard
                order={manage.order}
                statusLabel={statusLabel(manage.order.status)}
                onCancel={manage.order.canManage ? () => void cancelOrder() : undefined}
                cancelLabel={t.cancel}
                manageHint={undefined}
                deliveryEtaLabel={
                  manage.order.status === "OUT_FOR_DELIVERY" &&
                  manage.order.estimatedArrivalDisplay
                    ? manage.order.etaMinutes != null && manage.order.etaMinutes > 0
                      ? t.deliveryEta(
                          manage.order.etaMinutes,
                          manage.order.estimatedArrivalDisplay,
                        )
                      : t.deliveryEtaTime(manage.order.estimatedArrivalDisplay)
                    : undefined
                }
              />
            )}
            {manage.activeOrders.length > 1 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-700">{t.active}</h3>
                <div className="space-y-2">
                  {manage.activeOrders.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() =>
                        void fetch("/api/orders/manage/focus", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ orderId: o.id }),
                        }).then(() => loadManage())
                      }
                      className="w-full text-left"
                    >
                      <OrderCard order={o} statusLabel={statusLabel(o.status)} compact />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {manage.orderHistory.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-zinc-700">{t.history}</h3>
                <div className="space-y-2">
                  {manage.orderHistory.map((o) => (
                    <OrderCard key={o.id} order={o} statusLabel={statusLabel(o.status)} compact />
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                void fetch("/api/orders/manage/session", { method: "POST" });
                setStep("menu");
              }}
              className="w-full rounded-xl bg-orange-600 py-3 font-semibold text-white"
            >
              {t.newOrder}
            </button>
          </div>
        )}
      </main>

      {step === "menu" && cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 border-t border-orange-100 bg-white p-4 shadow-lg">
          <div className="mx-auto max-w-lg space-y-2">
            <p className="truncate text-xs text-zinc-500">{cartSummaryText(cart, locale)}</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-zinc-500">
                  {t.cart} · {t.itemCount(cartItemCount(cart))}
                </p>
                <p className="font-bold text-orange-600">
                  {formatPriceEuros(cartTotal(cart), localeTag)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setStep("checkout")}
                className="rounded-xl bg-orange-600 px-6 py-3 font-semibold text-white"
              >
                {t.continue}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="px-4 py-3 text-center text-xs text-zinc-400">
        <Link href={`/privacy?lang=${locale}`} className="underline">
          {t.privacy}
        </Link>
      </footer>
    </div>
  );
}

function formatManageCountdown(remainingMs: number, locale: Locale): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) {
    return locale === "el"
      ? `${days}η ${hours}ω ${minutes}λ`
      : `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function ManageCountdown({
  manageUntil,
  label,
  deadlineDisplay,
  locale,
  onExpired,
}: {
  manageUntil: string;
  label: (time: string) => string;
  deadlineDisplay?: string;
  locale: Locale;
  onExpired: () => void;
}) {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, new Date(manageUntil).getTime() - Date.now()),
  );
  const expiredRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    const tick = () => {
      const ms = Math.max(0, new Date(manageUntil).getTime() - Date.now());
      setRemainingMs(ms);
      if (ms === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpired();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [manageUntil, onExpired]);

  if (remainingMs <= 0) {
    return null;
  }

  const urgent = remainingMs <= 60_000;

  return (
    <div
      className={`rounded-xl px-3 py-2.5 text-sm ring-1 ${
        urgent
          ? "bg-red-50 font-semibold text-red-800 ring-red-200"
          : "bg-orange-50 text-orange-900 ring-orange-100"
      }`}
    >
      <p>{label(formatManageCountdown(remainingMs, locale))}</p>
      {deadlineDisplay && (
        <p className={`mt-0.5 text-xs ${urgent ? "text-red-700" : "text-orange-800/80"}`}>
          {deadlineDisplay}
        </p>
      )}
    </div>
  );
}

function OrderCard({
  order,
  statusLabel,
  onCancel,
  cancelLabel,
  manageHint,
  deliveryEtaLabel,
  compact,
}: {
  order: ManageOrder;
  statusLabel: string;
  onCancel?: () => void;
  cancelLabel?: string;
  manageHint?: string;
  deliveryEtaLabel?: string;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-xl bg-white ring-1 ring-zinc-200 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold">#{order.orderNumber}</p>
          <p className="text-sm text-zinc-500">{order.requestedAtDisplay}</p>
        </div>
        <span className="rounded-full bg-orange-50 px-2 py-1 text-xs font-medium text-orange-800">
          {statusLabel}
        </span>
      </div>
      <ul className="mt-2 space-y-1 text-sm text-zinc-700">
        {order.items.map((i, idx) => (
          <li key={idx}>
            {i.quantity}× {i.name}
          </li>
        ))}
      </ul>
      <p className="mt-2 font-semibold text-orange-600">{order.totalDisplay}</p>
      {order.deliveryAddress && (
        <p className="mt-1 text-xs text-zinc-500">{order.deliveryAddress}</p>
      )}
      {deliveryEtaLabel && !compact && (
        <p className="mt-2 text-sm font-medium text-blue-800">{deliveryEtaLabel}</p>
      )}
      {manageHint && !compact && (
        <p className="mt-2 text-xs text-zinc-500">{manageHint}</p>
      )}
      {onCancel && cancelLabel && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 w-full rounded-lg border border-red-200 py-2 text-sm text-red-700"
        >
          {cancelLabel}
        </button>
      )}
    </div>
  );
}
