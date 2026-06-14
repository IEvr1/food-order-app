"use client";

import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type DashboardPwaInstallProps = {
  label: string;
};

function isStandaloneDisplayMode() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in window.navigator && window.navigator.standalone === true)
  );
}

export function DashboardPwaInstall({ label }: DashboardPwaInstallProps) {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/dashboard/sw.js", { scope: "/dashboard/" }).catch(() => {
        // Installation remains optional; the dashboard should continue normally.
      });
    }

    if (isStandaloneDisplayMode()) {
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (!installPrompt) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={async () => {
        await installPrompt.prompt();
        await installPrompt.userChoice.catch(() => undefined);
        setInstallPrompt(null);
      }}
      className="rounded-xl border border-violet-200 bg-white px-3 py-1.5 text-sm font-medium text-violet-700 shadow transition hover:border-violet-300 hover:bg-violet-50"
    >
      {label}
    </button>
  );
}
