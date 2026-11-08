import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const endpoint = searchParams.get("endpoint");
    const symbol = searchParams.get("symbol") || "BTCUSDT";

    let url = "";
    if (endpoint === "ticker") {
      url = "https://api.mexc.com/api/v3/ticker/24hr";
    } else if (endpoint === "price") {
      // Hafif: sadece {symbol, price} — 24s istatistik yok
      url = "https://api.mexc.com/api/v3/ticker/price";
    } else if (endpoint === "klines") {
      const interval = searchParams.get("interval") || "15m";
      const limit = searchParams.get("limit") || "100";
      url = `https://api.mexc.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    } else if (endpoint === "depth") {
      const limit = searchParams.get("limit") || "20";
      url = `https://api.mexc.com/api/v3/depth?symbol=${symbol}&limit=${limit}`;
    } else if (endpoint === "deals") {
      const limit = searchParams.get("limit") || "40";
      url = `https://api.mexc.com/api/v3/trades?symbol=${symbol}&limit=${limit}`;
    } else {
      return NextResponse.json({ error: "Unknown endpoint" }, { status: 400 });
    }

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "crypto-bot-mexc/1.0",
      },
      next: { revalidate: 2 }, // 2 saniye cache
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `MEXC API error: ${res.statusText}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
