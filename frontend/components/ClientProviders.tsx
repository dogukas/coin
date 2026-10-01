"use client";

import dynamic from "next/dynamic";

const PumpAlerts = dynamic(
  () => import("@/components/dashboard/PumpAlerts"),
  { ssr: false }
);

export default function ClientProviders() {
  return <PumpAlerts />;
}
