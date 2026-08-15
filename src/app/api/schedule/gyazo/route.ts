import { NextRequest, NextResponse } from "next/server";
import { fetchDayEvents } from "@/lib/calendar-day";
import {
  getMorningSchedulePlan,
  saveMorningSchedulePlan,
} from "@/lib/db";
import { uploadToGyazo } from "@/lib/gyazo";
import {
  buildScheduleSlots,
  deserializeSlotMap,
  ScheduleMode,
  serializeSlotMap,
} from "@/lib/schedule";
import { renderSchedulePng } from "@/lib/schedule-image";
import {
  getEveningDateJST,
  getTodayJST,
  toDateString,
} from "@/lib/template";

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
        : toDateString(
            mode === "evening" ? getEveningDateJST() : getTodayJST()
          );

    const events = await fetchDayEvents(dateStr);

    if (mode === "morning") {
      const slots = buildScheduleSlots(events, "morning");
      await saveMorningSchedulePlan(
        dateStr,
        serializeSlotMap(slots.plan),
        slots.window.startMin,
        slots.window.endMin
      );
      const png = await renderSchedulePng(slots);
      const gyazo = await uploadToGyazo(png, `schedule-${dateStr}-morning.png`);
      return NextResponse.json({
        url: gyazo.permalink_url || gyazo.url,
        permalink_url: gyazo.permalink_url,
        image_url: gyazo.url,
        window: slots.window,
      });
    }

    // 終業: 左列は始業時に DB 保存した予定のみ、右列は当日カレンダーの22時までの実績
    // （ライブ予定で左列を埋めると「今日の予定＝実際の進行」になるため禁止）
    const saved = await getMorningSchedulePlan(dateStr);
    const slots = buildScheduleSlots(
      events,
      "evening",
      saved
        ? {
            planOverride: deserializeSlotMap(saved.planJson),
            windowOverride: {
              startMin: saved.windowStartMin,
              endMin: saved.windowEndMin,
            },
          }
        : undefined
    );
    const png = await renderSchedulePng(slots);
    const gyazo = await uploadToGyazo(png, `schedule-${dateStr}-evening.png`);

    return NextResponse.json({
      url: gyazo.permalink_url || gyazo.url,
      permalink_url: gyazo.permalink_url,
      image_url: gyazo.url,
      window: slots.window,
      usedMorningPlan: Boolean(saved),
    });
  } catch (e) {
    console.error("schedule/gyazo error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
