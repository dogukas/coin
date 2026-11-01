import { NextResponse } from "next/server";

export const revalidate = 600; // 10 minutes cache

export async function GET() {
  try {
    let value = 50;
    let classification = "Nötr";

    try {
      const res = await fetch("https://api.alternative.me/fng/?limit=1", {
        next: { revalidate: 600 },
      });
      if (res.ok) {
        const json = await res.json();
        const item = json?.data?.[0];
        if (item) {
          value = Number(item.value) || 50;
          const trClassMap: Record<string, string> = {
            "Extreme Fear": "Aşırı Korku",
            Fear: "Korku",
            Neutral: "Nötr",
            Greed: "Açgözlülük",
            "Extreme Greed": "Aşırı Açgözlülük",
          };
          classification = trClassMap[item.value_classification] || item.value_classification || "Nötr";
        }
      }
    } catch (err) {
      console.warn("FNG fetch error:", err);
    }

    return NextResponse.json({
      value,
      classification,
      global_volume_24h: 84500000000,
    });
  } catch (err: any) {
    return NextResponse.json({
      value: 50,
      classification: "Nötr",
      global_volume_24h: 84500000000,
    });
  }
}
