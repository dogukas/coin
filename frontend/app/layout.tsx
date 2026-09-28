import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";
import PumpAlerts from "@/components/dashboard/PumpAlerts";

export const metadata: Metadata = {
  title: "Crypto Signal Dashboard | Gerçek Zamanlı Analiz",
  description:
    "Canlı kripto para analizi ve sinyal motoru — RSI, MACD, EMA, Bollinger Bantları ile teknik analiz ve akıllı al/sat sinyalleri.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans antialiased bg-mesh text-white min-h-screen overflow-x-hidden selection:bg-emerald-500/30">
        {/* Background effects */}
        <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute inset-0 bg-grid opacity-30 mix-blend-overlay" />
          <div className="absolute top-0 inset-x-0 h-[800px] bg-gradient-to-b from-emerald-500/5 via-transparent to-transparent opacity-60" />
        </div>

        {/* Content */}
        <div className="relative z-10">{children}</div>
        
        {/* Toast Notifications */}
        <Toaster position="top-right" theme="dark" richColors />
        
        {/* Global Pump/Dump Detector */}
        <PumpAlerts />
      </body>
    </html>
  );
}
