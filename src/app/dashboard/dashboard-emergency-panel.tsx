"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { emergencyCancelDayAndNotify } from "@/app/dashboard/emergency-actions";
import type { Locale } from "@/lib/locale";

type Labels = {
  button: string;
  step1Title: string;
  dayExplanation: string;
  step1Continue: string;
  step1Back: string;
  step2Title: string;
  step2Checkbox: string;
  step2Placeholder: string;
  step2Hint: string;
  step2Execute: string;
  step2Back: string;
  working: string;
  resultTitle: string;
  resultCancelled: string;
  resultAttempted: string;
  resultSmsSent: string;
  resultSmsFailures: string;
  resultCalendarFailures: string;
  close: string;
};

type Props = {
  lang: Locale;
  filterDate: string;
  activeDayCount: number;
  mutationsAllowed: boolean;
  labels: Labels;
};

export function DashboardEmergencyPanel({
  lang,
  filterDate,
  activeDayCount,
  mutationsAllowed,
  labels,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [ack, setAck] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    cancelled: number;
    attempted: number;
    smsSent: number;
    smsFailures: string[];
    calendarFailures: { bookingId: string }[];
  } | null>(null);

  const requiredPhrase = lang === "el" ? "ΑΚΥΡΩΣΗ" : "CANCEL";
  const phraseOk = phrase.trim() === requiredPhrase;

  function reset() {
    setStep(1);
    setAck(false);
    setPhrase("");
    setError(null);
    setResult(null);
    setBusy(false);
  }

  function closeModal() {
    setOpen(false);
    reset();
  }

  if (!mutationsAllowed) {
    return null;
  }

  async function onExecute() {
    if (!ack || !phraseOk || busy) return;
    setError(null);
    setBusy(true);
    try {
      const r = await emergencyCancelDayAndNotify(filterDate, lang);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setResult({
        cancelled: r.cancelled,
        attempted: r.attempted,
        smsSent: r.smsSent,
        smsFailures: r.smsFailures > 0 ? [`${r.smsFailures} failures`] : [],
        calendarFailures: [],
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="mb-4 rounded-2xl border border-amber-200/90 bg-amber-50/90 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-amber-950">{labels.dayExplanation}</p>
          <button
            type="button"
            disabled={activeDayCount === 0}
            onClick={() => {
              reset();
              setOpen(true);
            }}
            className="shrink-0 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {labels.button}
          </button>
        </div>
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal
          onClick={() => !busy && closeModal()}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {result ? (
              <>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900">{labels.resultTitle}</h3>
                <ul className="mb-3 list-inside list-disc space-y-1 text-sm text-zinc-700">
                  <li>
                    {labels.resultCancelled}: {result.cancelled}
                  </li>
                  <li>
                    {labels.resultAttempted}: {result.attempted}
                  </li>
                  <li>
                    {labels.resultSmsSent}: {result.smsSent}
                  </li>
                  {result.calendarFailures.length > 0 ? (
                    <li className="text-amber-800">
                      {labels.resultCalendarFailures}: {result.calendarFailures.length}
                    </li>
                  ) : null}
                  {result.smsFailures.length > 0 ? (
                    <li>
                      <span className="font-medium text-red-700">{labels.resultSmsFailures}</span>
                      <ul className="mt-1 list-inside list-disc pl-2 text-xs text-red-700">
                        {result.smsFailures.map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                      </ul>
                    </li>
                  ) : null}
                </ul>
                <button
                  type="button"
                  className="w-full rounded-lg bg-zinc-800 py-2 text-sm font-medium text-white hover:bg-zinc-900"
                  onClick={closeModal}
                >
                  {labels.close}
                </button>
              </>
            ) : step === 1 ? (
              <>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900">{labels.step1Title}</h3>
                <p className="mb-4 text-sm text-zinc-600">{labels.dayExplanation}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || activeDayCount === 0}
                    onClick={() => setStep(2)}
                    className="flex-1 rounded-lg bg-amber-600 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {labels.step1Continue}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={closeModal}
                    className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {labels.step1Back}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="mb-2 text-sm font-semibold text-zinc-900">{labels.step2Title}</h3>
                <label className="mb-3 flex items-start gap-2 text-sm text-zinc-700">
                  <input
                    type="checkbox"
                    checked={ack}
                    onChange={(e) => setAck(e.target.checked)}
                    className="mt-0.5"
                  />
                  {labels.step2Checkbox}
                </label>
                <label className="mb-1 block text-xs font-medium text-zinc-600">{labels.step2Hint}</label>
                <input
                  type="text"
                  value={phrase}
                  onChange={(e) => setPhrase(e.target.value)}
                  placeholder={labels.step2Placeholder}
                  autoComplete="off"
                  className="mb-3 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
                {error ? <p className="mb-2 text-sm text-red-600">{error}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !ack || !phraseOk}
                    onClick={onExecute}
                    className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy ? labels.working : labels.step2Execute}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setStep(1);
                      setError(null);
                    }}
                    className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {labels.step2Back}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
