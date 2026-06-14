"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addShopClosureFromDashboard, deleteShopClosureFromDashboard } from "@/app/dashboard/actions";
import type { Locale } from "@/lib/locale";

export type ClosureRow = {
  id: string;
  startDate: string;
  endDate: string;
  label: string | null;
};

type Labels = {
  title: string;
  subtitle: string;
  from: string;
  to: string;
  note: string;
  add: string;
  delete: string;
  empty: string;
  working: string;
  listHeading: string;
};

type Props = {
  lang: Locale;
  closures: ClosureRow[];
  mutationsAllowed: boolean;
  labels: Labels;
};

export function DashboardClosuresPanel({ lang, closures, mutationsAllowed, labels }: Props) {
  const router = useRouter();
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!mutationsAllowed || busy) return;
    setError(null);
    setBusy(true);
    try {
      const r = await addShopClosureFromDashboard(start, end, note || undefined, lang);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setStart("");
      setEnd("");
      setNote("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (!mutationsAllowed || busy) return;
    if (!window.confirm(lang === "el" ? "Διαγραφή αυτής της περιόδου κλεισίματος;" : "Delete this closure period?")) {
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const r = await deleteShopClosureFromDashboard(id, lang);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-6 rounded-2xl border border-zinc-200/90 bg-white px-4 py-4 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-zinc-900">{labels.title}</h2>
      <p className="mb-4 text-sm text-zinc-600">{labels.subtitle}</p>

      {mutationsAllowed ? (
        <form onSubmit={onAdd} className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-zinc-600">
            {labels.from}
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-zinc-600">
            {labels.to}
            <input
              type="date"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex min-w-[12rem] flex-[2] flex-col gap-1 text-xs text-zinc-600">
            {labels.note}
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-lg border border-zinc-200 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-900 disabled:opacity-50"
          >
            {busy ? labels.working : labels.add}
          </button>
        </form>
      ) : null}

      {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}

      <h3 className="mb-2 text-sm font-medium text-zinc-800">{labels.listHeading}</h3>
      {closures.length === 0 ? (
        <p className="text-sm text-zinc-500">{labels.empty}</p>
      ) : (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
          {closures.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="text-zinc-800">
                {c.startDate} — {c.endDate}
                {c.label ? <span className="text-zinc-500"> ({c.label})</span> : null}
              </span>
              {mutationsAllowed ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onDelete(c.id)}
                  className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                >
                  {labels.delete}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
