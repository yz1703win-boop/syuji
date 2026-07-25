import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getRefreshToken } from "@/lib/db";
import { CalendarEvent, WeeklyCalendar } from "@/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("week_start");

  if (!weekStart) {
    return NextResponse.json({ error: "week_start required" }, { status: 400 });
  }

  // DBに保存されたrefresh tokenを使って自動認証
  const refreshToken = await getRefreshToken().catch(() => null);

  if (!refreshToken) {
    // 未連携の場合は空カレンダーを返す
    return NextResponse.json({
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
    } as WeeklyCalendar);
  }

  const startDate = new Date(weekStart);
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 5);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items ?? [];

    const allEvents: CalendarEvent[] = [];

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
          if (!item.summary) continue;
          const isAllDay = !!item.start?.date && !item.start?.dateTime;
          allEvents.push({
            id: item.id ?? "",
            summary: item.summary,
            start: item.start?.dateTime ?? item.start?.date ?? "",
            end: item.end?.dateTime ?? item.end?.date ?? "",
            allDay: isAllDay,
          });
        }
      } catch {
        // 個別カレンダーのエラーはスキップ
      }
    }

    const weekly: WeeklyCalendar = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
    };

    const dayKeys = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
    ] as const;

    for (const event of allEvents) {
      const d = new Date(event.start);
      // UTC時刻にJSTオフセット(+9h)を加算して曜日を判定
      const jstDay = new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
      if (jstDay >= 1 && jstDay <= 5) {
        weekly[dayKeys[jstDay - 1]].push(event);
      }
    }

    return NextResponse.json(weekly);
  } catch (e) {
    console.error("Calendar API error:", e);
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    );
  }
}
