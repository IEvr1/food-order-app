"use client";

import { useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DASHBOARD_ORDER_STATUSES, orderStatusLabel } from "@/lib/order-status-label";

type FilterLabels = {
  fromDate: string;
  toDate: string;
  status: string;
  fulfillment: string;
  all: string;
  pickup: string;
  delivery: string;
};

type Props = {
  lang: "el" | "en";
  labels: FilterLabels;
  basePath: "/dashboard" | "/dashboard/history" | "/dashboard/kpis";
  showPeriod?: boolean;
  periodOnly?: boolean;
  maxDate?: string;
  periodDefaults?: { from: string; to: string };
  current: {
    from: string;
    to: string;
    status: string;
    fulfillment: string;
  };
};

export function DashboardFilters({
  lang,
  labels,
  basePath,
  showPeriod = false,
  periodOnly = false,
  maxDate,
  periodDefaults,
  current,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);

  const apply = (form: HTMLFormElement) => {
    const fd = new FormData(form);
    const params = new URLSearchParams(searchParams.toString());
    params.set("lang", lang);
    params.delete("range");
    params.delete("phone");

    if (showPeriod) {
      const from = String(fd.get("from") ?? "").trim();
      const to = String(fd.get("to") ?? "").trim();
      if (periodDefaults && from === periodDefaults.from && to === periodDefaults.to) {
        params.delete("from");
        params.delete("to");
      } else {
        if (from) {
          params.set("from", from);
        } else {
          params.delete("from");
        }
        if (to) {
          params.set("to", to);
        } else {
          params.delete("to");
        }
      }
    } else {
      params.delete("from");
      params.delete("to");
    }

    const filterKeys = ["status", "fulfillment"] as const;
    for (const key of filterKeys) {
      const val = String(fd.get(key) ?? "").trim();
      if (val && val !== "all") {
        params.set(key, val);
      } else {
        params.delete(key);
      }
    }

    router.push(`${basePath}?${params.toString()}`);
  };

  const applyCurrent = () => {
    if (formRef.current) {
      apply(formRef.current);
    }
  };

  return (
    <form
      ref={formRef}
      className={`mb-6 grid gap-3 rounded-2xl border border-zinc-200 bg-white p-4 ${
        periodOnly ? "sm:grid-cols-2" : showPeriod ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"
      }`}
    >
      {showPeriod && (
        <>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">{labels.fromDate}</span>
            <input
              type="date"
              name="from"
              required
              max={maxDate}
              defaultValue={current.from}
              onChange={applyCurrent}
              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">{labels.toDate}</span>
            <input
              type="date"
              name="to"
              required
              max={maxDate}
              defaultValue={current.to}
              onChange={applyCurrent}
              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm"
            />
          </label>
        </>
      )}
      {!periodOnly && (
        <>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">{labels.status}</span>
            <select
              name="status"
              defaultValue={current.status}
              onChange={applyCurrent}
              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm"
            >
              <option value="all">{labels.all}</option>
              {DASHBOARD_ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {orderStatusLabel(status, lang)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-zinc-700">{labels.fulfillment}</span>
            <select
              name="fulfillment"
              defaultValue={current.fulfillment}
              onChange={applyCurrent}
              className="w-full rounded-lg border border-zinc-300 px-2 py-2 text-sm"
            >
              <option value="all">{labels.all}</option>
              <option value="PICKUP">{labels.pickup}</option>
              <option value="DELIVERY">{labels.delivery}</option>
            </select>
          </label>
        </>
      )}
    </form>
  );
}
