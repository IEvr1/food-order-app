"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  lang: "el" | "en";
  labels: {
    period: string;
    status: string;
    phone: string;
    fulfillment: string;
    all: string;
    apply: string;
    pickup: string;
    delivery: string;
    rangeToday: string;
    rangeTomorrow: string;
    rangeNext3: string;
    rangeWeek7: string;
    rangeRemainingMonth: string;
    rangeCurrentMonth: string;
    rangeLastMonth: string;
  };
  current: {
    range: string;
    status: string;
    phone: string;
    fulfillment: string;
  };
};

export function DashboardFilters({ lang, labels, current }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const apply = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", lang);
    for (const key of ["range", "status", "phone", "fulfillment"]) {
      const val = String(fd.get(key) ?? "").trim();
      if (val && val !== "all") {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }
    router.push(`/dashboard?${params.toString()}`);
  };

  return (
    <form
      className="mb-6 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5"
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
    >
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">{labels.period}</span>
        <select name="range" defaultValue={current.range} className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm">
          <option value="today">{labels.rangeToday}</option>
          <option value="tomorrow">{labels.rangeTomorrow}</option>
          <option value="next3">{labels.rangeNext3}</option>
          <option value="week7">{labels.rangeWeek7}</option>
          <option value="remainingMonth">{labels.rangeRemainingMonth}</option>
          <option value="currentMonth">{labels.rangeCurrentMonth}</option>
          <option value="lastMonth">{labels.rangeLastMonth}</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">{labels.status}</span>
        <select name="status" defaultValue={current.status} className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm">
          <option value="all">{labels.all}</option>
          <option value="CONFIRMED">CONFIRMED</option>
          <option value="PREPARING">PREPARING</option>
          <option value="READY">READY</option>
          <option value="OUT_FOR_DELIVERY">OUT_FOR_DELIVERY</option>
          <option value="COMPLETED">COMPLETED</option>
          <option value="CANCELLED">CANCELLED</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">{labels.fulfillment}</span>
        <select name="fulfillment" defaultValue={current.fulfillment} className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm">
          <option value="all">{labels.all}</option>
          <option value="PICKUP">{labels.pickup}</option>
          <option value="DELIVERY">{labels.delivery}</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">{labels.phone}</span>
        <input name="phone" defaultValue={current.phone} className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm" />
      </label>
      <div className="flex items-end">
        <button type="submit" className="w-full rounded-xl bg-orange-600 py-2.5 text-sm font-semibold text-white">
          {labels.apply}
        </button>
      </div>
    </form>
  );
}
