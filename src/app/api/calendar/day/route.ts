import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getRefreshToken } from "@/lib/db";
import { shouldIncludeOvertimeEvent, OvertimeEvent } from "@/lib/template";

const OVERTIME_START_MIN = 18 * 60;

/** UTC の ISO 文字列から JST の「その日の分」を返す */
function getJSTMinutesOfDay(isoString: string): number {
  const d = new Date(isoString);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}

/**
 * 18時以降に重なる分数を返す。
 * 例: 17:00–19:00 → 60（18:00–19:00）
 */
function getOvertimeMinutes(startIso: string, endIso: string): number {
  const startMin = getJSTMinutesOfDay(startIso);
  let endMin = getJSTMinutesOfDay(endIso);
  if (endMin <= startMin) endMin += 24 * 60;

  const overtimeStart = Math.max(startMin, OVERTIME_START_MIN);
  const duration = endMin - overtimeStart;
  return duration > 0 ? Math.round(duration) : 0;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date"); // YYYY-MM-DD

  if (!date) {
    return NextResponse.json({ error: "date required" }, { status: 400 });
  }

  const refreshToken = await getRefreshToken().catch(() => null);
  if (!refreshToken) {
    return NextResponse.json({ events: [] as OvertimeEvent[] });
  }

  // 当日の開始〜翌日開始
  const startDate = new Date(date + "T00:00:00+09:00");
  const endDate = new Date(date + "T23:59:59+09:00");

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items ?? [];

    const overtimeEvents: OvertimeEvent[] = [];

    for (const cal of calendars) {
      if (!cal.id) continue;
      try {
        const res = await calendar.events.list({
          calendarId: cal.id,
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        });

        for (const item of res.data.items ?? []) {
          if (!item.summary || !item.start?.dateTime) continue;

          const name = item.summary;
          if (!shouldIncludeOvertimeEvent(name)) continue;

          const duration = getOvertimeMinutes(
            item.start.dateTime,
            item.end?.dateTime ?? item.start.dateTime
          );
          if (duration <= 0) continue;

          overtimeEvents.push({ summary: name, durationMinutes: duration });
        }
      } catch {
        // 個別カレンダーのエラーはスキップ
      }
    }

    return NextResponse.json({ events: overtimeEvents });
  } catch (e) {
    console.error("Calendar day API error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
