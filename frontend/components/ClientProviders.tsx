"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useDashboardStore } from "@/lib/store";
import { getSignalLevel } from "@/lib/utils";

const PumpAlerts = dynamic(
  () => import("@/components/dashboard/PumpAlerts"),
  { ssr: false }
);

function ThemeController() {
  const signalData = useDashboardStore((s) => s.signalData);

  useEffect(() => {
    if (!signalData) {
      document.body.classList.remove("theme-positive", "theme-negative");
      return;
    }

    const level = getSignalLevel(signalData.score);
    
    // Remove existing themes
    document.body.classList.remove("theme-positive", "theme-negative");
    
    // Apply new theme based on signal level
    if (level === "strong_buy" || level === "buy") {
      document.body.classList.add("theme-positive");
    } else if (level === "sell") {
      document.body.classList.add("theme-negative");
    }
    // "hold" (neutral) means no extra class, which falls back to the default variables (blue theme)

  }, [signalData]);

  return null;
}

export default function ClientProviders() {
  return (
    <>
      <ThemeController />
      <PumpAlerts />
    </>
  );
}
