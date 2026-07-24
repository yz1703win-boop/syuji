import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { google } from "googleapis";
import { CalendarEvent, WeeklyCalendar } from "@/types";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("week_start");

  if (!weekStart) {
    return NextResponse.json({ error: "week_start required" }, { status: 400 });
  }

  const startDate = new Date(weekStart);
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 5); // 月〜金（5日分）

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: session.accessToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    // 全カレンダーのリストを取得
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items ?? [];

    const allEvents: CalendarEvent[] = [];

    for (const cal of calendars) {
      if (!cal.id) continue;
      const res = await calendar.events.list({
        calendarId: cal.id,
        timeMin: startDate.toISOString(),
        timeMax: endDate.toISOString(),
        singleEvents: true,
        orderBy: "startTime",
      });

      const items = res.data.items ?? [];
      for (const item of items) {
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
    }

    // 曜日ごとに振り分け
    const weekly: WeeklyCalendar = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
    };

    const dayKeys = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

    for (const event of allEvents) {
      const d = new Date(event.start);
      const day = d.getDay(); // 1=月 2=火 3=水 4=木 5=金
      if (day >= 1 && day <= 5) {
        weekly[dayKeys[day - 1]].push(event);
      }
    }

    return NextResponse.json(weekly);
  } catch (e) {
    console.error("Calendar API error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
