"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DeliveryLocationPicker,
  type DeliveryLocation,
} from "@/app/chat/delivery-location-picker";
import { formatPriceEuros } from "@/lib/order";
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
  latitude: number | null;
  longitude: number | null;
  deliveryRadiusMeters: number;
};

type CartLine = { menuItemId: string; name: string; priceCents: number; quantity: number };

type SlotOption = { iso: string; label: string };

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
  notes: string | null;
};

type ManageSummary = {
  shopName: string;
  customerName: string | null;
  order: ManageOrder | null;
  uiPhase: string;
  canManage: boolean;
  activeOrders: ManageOrder[];
  orderHistory: ManageOrder[];
};

type Step = "menu" | "checkout" | "success" | "manage";

function cartTotal(lines: CartLine[]) {
  return lines.reduce((s, l) => s + l.priceCents * l.quantity, 0);
}

export default function ChatPage() {
  const [locale, setLocale] = useState<Locale>(() => {
    if (typeof window === "undefined") return "el";
    return parseLocale(new URLSearchParams(window.location.search).get("lang"));
  });

  const t =
    locale === "el"
      ? {
          welcome: "Καλώς ήρθατε! Τι θα θέλατε να παραγγείλετε;",
          cart: "Καλάθι",
          continue: "Συνέχεια",
          emptyCart: "Το καλάθι είναι άδειο.",
          pickup: "Παραλαβή",
          delivery: "Delivery",
          pickTime: "Επιλέξτε ώρα",
          noSlots: "Δεν υπάρχουν διαθέσιμες ώρες.",
          namePh: "Ονοματεπώνυμο",
          phonePh: "Κινητό (8 ψηφία)",
          notesPh: "Σημειώσεις (π.χ. χωρίς κρεμμύδι)",
          submit: "Υποβολή παραγγελίας",
          submitting: "Υποβολή...",
          success: "Η παραγγελία ολοκληρώθηκε!",
          orderNum: "Αριθμός",
          total: "Σύνολο",
          newOrder: "Νέα παραγγελία",
          manageTitle: "Η παραγγελία σας",
          cancel: "Ακύρωση παραγγελίας",
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
          confirmCancel: "Να ακυρωθεί η παραγγελία;",
          yes: "Ναι",
          no: "Όχι",
        }
      : {
          welcome: "Welcome! What would you like to order?",
          cart: "Cart",
          continue: "Continue",
          emptyCart: "Your cart is empty.",
          pickup: "Pickup",
          delivery: "Delivery",
          pickTime: "Pick a time",
          noSlots: "No available times.",
          namePh: "Full name",
          phonePh: "Mobile (8 digits)",
          notesPh: "Notes (e.g. no onion)",
          submit: "Place order",
          submitting: "Submitting...",
          success: "Order placed!",
          orderNum: "Number",
          total: "Total",
          newOrder: "New order",
          manageTitle: "Your order",
          cancel: "Cancel order",
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
          confirmCancel: "Cancel this order?",
          yes: "Yes",
          no: "No",
        };

  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [step, setStep] = useState<Step>("menu");
  const [fulfillment, setFulfillment] = useState<"PICKUP" | "DELIVERY">("PICKUP");
  const [deliveryLocation, setDeliveryLocation] = useState<DeliveryLocation | null>(null);
  const [dateIso, setDateIso] = useState("");
  const [slots, setSlots] = useState<SlotOption[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successOrder, setSuccessOrder] = useState<{ number: number; totalCents: number } | null>(
    null,
  );
  const [manage, setManage] = useState<ManageSummary | null>(null);

  const localeTag = locale === "el" ? "el-GR" : "en-US";

  const loadMenu = useCallback(async () => {
    const res = await fetch("/api/menu");
    const data = await res.json();
    setShop(data.shop);
    setCategories(data.categories);
    if (data.categories[0]) setActiveCategoryId(data.categories[0].id);
  }, []);

  const loadManage = useCallback(async () => {
    const res = await fetch(`/api/orders/manage/summary?lang=${locale}`);
    if (res.status === 401) {
      setManage(null);
      return;
    }
    if (res.ok) {
      const data = await res.json();
      setManage(data);
      if (data.order || data.activeOrders?.length) {
        setStep("manage");
      }
    }
  }, [locale]);

  useEffect(() => {
    void loadMenu();
    void loadManage();
  }, [loadMenu, loadManage]);

  useEffect(() => {
    if (!dateIso) return;
    void fetch(`/api/orders/availability?date=${dateIso}`)
      .then((r) => r.json())
      .then((d) => {
        setSlots(d.slots ?? []);
        if (d.today && !dateIso) setDateIso(d.today);
      });
  }, [dateIso]);

  useEffect(() => {
    if (step === "checkout" && shop && !dateIso) {
      void fetch("/api/orders/availability?date=" + new Date().toISOString().slice(0, 10))
        .then((r) => r.json())
        .then((d) => setDateIso(d.today ?? new Date().toISOString().slice(0, 10)));
    }
  }, [step, shop, dateIso]);

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
        requestedAt: selectedSlot,
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

    setSuccessOrder({ number: data.orderNumber, totalCents: data.totalCents });
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
        </div>
      </header>

      <main className="flex-1 px-4 py-4 pb-28">
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
                  <button
                    type="button"
                    onClick={() => addToCart(item)}
                    className="shrink-0 rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
                  >
                    +
                  </button>
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
            <p className="text-right font-bold">
              {t.total}: {formatPriceEuros(cartTotal(cart), localeTag)}
            </p>

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
              <p className="text-xs text-amber-700">{t.deliveryDisabled}</p>
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
              <label className="mb-1 block text-sm font-medium">{t.pickTime}</label>
              <input
                type="date"
                value={dateIso}
                onChange={(e) => {
                  setDateIso(e.target.value);
                  setSelectedSlot(null);
                }}
                className="mb-2 w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm"
              />
              <div className="flex flex-wrap gap-2">
                {slots.length === 0 && <p className="text-sm text-zinc-500">{t.noSlots}</p>}
                {slots.map((s) => (
                  <button
                    key={s.iso}
                    type="button"
                    onClick={() => setSelectedSlot(s.iso)}
                    className={`rounded-lg px-3 py-2 text-sm ${selectedSlot === s.iso ? "bg-orange-600 text-white" : "bg-white ring-1 ring-zinc-200"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
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
                !selectedSlot ||
                cart.length === 0 ||
                (fulfillment === "DELIVERY" && !deliveryLocation)
              }
              onClick={() => void submitOrder()}
              className="w-full rounded-xl bg-orange-600 py-3 font-semibold text-white disabled:opacity-50"
            >
              {loading ? t.submitting : t.submit}
            </button>
            <button type="button" onClick={() => setStep("menu")} className="w-full text-sm text-zinc-600">
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
            {manage.order && (
              <OrderCard
                order={manage.order}
                statusLabel={statusLabel(manage.order.status)}
                onCancel={manage.order.canManage ? () => void cancelOrder() : undefined}
                cancelLabel={t.cancel}
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
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <div>
              <p className="text-sm text-zinc-500">{t.cart}</p>
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
      )}

      <footer className="px-4 py-3 text-center text-xs text-zinc-400">
        <Link href={`/privacy?lang=${locale}`} className="underline">
          {t.privacy}
        </Link>
      </footer>
    </div>
  );
}

function OrderCard({
  order,
  statusLabel,
  onCancel,
  cancelLabel,
  compact,
}: {
  order: ManageOrder;
  statusLabel: string;
  onCancel?: () => void;
  cancelLabel?: string;
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
