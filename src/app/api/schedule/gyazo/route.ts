import { NextRequest, NextResponse } from "next/server";
import { fetchDayEvents } from "@/lib/calendar-day";
import { uploadToGyazo } from "@/lib/gyazo";
import { buildScheduleSlots, ScheduleMode } from "@/lib/schedule";
import { renderSchedulePng } from "@/lib/schedule-image";
import { getTodayJST, toDateString } from "@/lib/template";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const mode = (body.type ?? body.mode) as ScheduleMode;
    if (mode !== "morning" && mode !== "evening") {
      return NextResponse.json(
        { error: "type must be morning or evening" },
        { status: 400 }
      );
    }

    const dateStr =
      typeof body.date === "string" && body.date
        ? body.date
        : toDateString(getTodayJST());

    const events = await fetchDayEvents(dateStr);
    const slots = buildScheduleSlots(events, mode, new Date());
    const png = await renderSchedulePng(slots);
    const gyazo = await uploadToGyazo(png, `schedule-${dateStr}-${mode}.png`);

    return NextResponse.json({
      url: gyazo.permalink_url || gyazo.url,
      permalink_url: gyazo.permalink_url,
      image_url: gyazo.url,
      window: slots.window,
    });
  } catch (e) {
    console.error("schedule/gyazo error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
