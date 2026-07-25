import { google } from "googleapis";
import { getRefreshToken } from "@/lib/db";
import { CalendarEvent } from "@/types";

/** 指定日（YYYY-MM-DD, JST）の全カレンダー予定を取得 */
export async function fetchDayEvents(dateStr: string): Promise<CalendarEvent[]> {
  const refreshToken = await getRefreshToken().catch(() => null);
  if (!refreshToken) return [];

  // JST のその日 00:00–24:00 を UTC で表現
  const timeMin = new Date(`${dateStr}T00:00:00+09:00`);
  const timeMax = new Date(`${dateStr}T24:00:00+09:00`);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });
  const calendarList = await calendar.calendarList.list();
  const calendars = calendarList.data.items ?? [];

  const allEvents: CalendarEvent[] = [];

  for (const cal of calendars) {
    if (!cal.id) continue;
    try {
      const res = await calendar.events.list({
        calendarId: cal.id,
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
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
      // 個別カレンダーはスキップ
    }
  }

  return allEvents;
}
