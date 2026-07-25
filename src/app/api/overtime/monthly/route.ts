import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getRefreshToken } from "@/lib/db";
import { shouldIncludeOvertimeEvent } from "@/lib/template";

function getJSTHour(isoString: string): number {
  return (new Date(isoString).getUTCHours() + 9) % 24;
}

function getDurationMinutes(start: string, end: string): number {
  return Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000
  );
}

/**
 * GET /api/overtime/monthly?month=2026-07
 * 当月1日〜前日の18時以降イベントをGoogleカレンダーから集計して合計分数を返す
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM

  if (!month) {
    return NextResponse.json({ error: "month required" }, { status: 400 });
  }

  const refreshToken = await getRefreshToken().catch(() => null);
  if (!refreshToken) {
    return NextResponse.json({ total_minutes: 0 });
  }

  // 当月初日（JST）
  const firstDayJST = new Date(`${month}-01T00:00:00+09:00`);

  // 前日の終わり（JST 23:59:59）
  const nowJST = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
  const yesterday = new Date(nowJST);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(14, 59, 59, 999); // JST 23:59:59 = UTC 14:59:59

  // 前日が当月初日より前なら0（月初日に開くケース）
  if (yesterday < firstDayJST) {
    return NextResponse.json({ total_minutes: 0 });
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items ?? [];

    let totalMinutes = 0;

    for (const cal of calendars) {
      if (!cal.id) continue;
      try {
        const res = await calendar.events.list({
          calendarId: cal.id,
          timeMin: firstDayJST.toISOString(),
          timeMax: yesterday.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
          maxResults: 500,
        });

        for (const item of res.data.items ?? []) {
          if (!item.summary || !item.start?.dateTime) continue;

          const startHour = getJSTHour(item.start.dateTime);
          if (startHour < 18) continue;

          if (!shouldIncludeOvertimeEvent(item.summary)) continue;

          const duration = getDurationMinutes(
            item.start.dateTime,
            item.end?.dateTime ?? item.start.dateTime
          );
          if (duration <= 0) continue;

          totalMinutes += duration;
        }
      } catch {
        // 個別カレンダーのエラーはスキップ
      }
    }

    return NextResponse.json({ total_minutes: totalMinutes });
  } catch (e) {
    console.error("Overtime monthly API error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
