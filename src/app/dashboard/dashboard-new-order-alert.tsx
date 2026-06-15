"use client";

import { useEffect, useRef } from "react";
import { playNewOrderChime, unlockDashboardAudio } from "@/lib/dashboard-new-order-sound";

export function DashboardNewOrderAlert({ orderIds }: { orderIds: string[] }) {
  const seenIdsRef = useRef<Set<string> | null>(null);
  const orderIdsKey = orderIds.join("\0");

  useEffect(() => {
    unlockDashboardAudio();
  }, []);

  useEffect(() => {
    const currentIds = orderIdsKey ? orderIdsKey.split("\0") : [];

    if (seenIdsRef.current === null) {
      seenIdsRef.current = new Set(currentIds);
      return;
    }

    let hasNewOrder = false;
    for (const id of currentIds) {
      if (!seenIdsRef.current.has(id)) {
        seenIdsRef.current.add(id);
        hasNewOrder = true;
      }
    }

    if (hasNewOrder) {
      void playNewOrderChime();
    }
  }, [orderIdsKey]);

  return null;
}
