import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getRefreshToken } from "@/lib/db";
import { CalendarEvent, DayKey, WeeklyCalendar } from "@/types";

const DAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

/** 日付文字列 "YYYY-MM-DD" から曜日キーを返す（月〜金のみ） */
function getDayKeyFromDate(dateStr: string): DayKey | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  if (day >= 1 && day <= 5) return DAY_KEYS[day - 1];
  return null;
}

/** ISO 日時文字列を JST に換算して曜日キーを返す（月〜金のみ） */
function getDayKeyFromDateTime(isoString: string): DayKey | null {
  const d = new Date(isoString);
  const jstDay = new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
  if (jstDay >= 1 && jstDay <= 5) return DAY_KEYS[jstDay - 1];
  return null;
}

/** 祝日カレンダーかどうかを判定 */
function isHolidayCalendar(id: string, name: string): boolean {
  const lower = (id + name).toLowerCase();
  return (
    lower.includes("holiday") ||
    lower.includes("祝日") ||
    lower.includes("holidays")
  );
}

const EMPTY_HOLIDAYS: Record<DayKey, boolean> = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("week_start");

  if (!weekStart) {
    return NextResponse.json({ error: "week_start required" }, { status: 400 });
  }

  const refreshToken = await getRefreshToken().catch(() => null);
  if (!refreshToken) {
    return NextResponse.json({
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      holidays: { ...EMPTY_HOLIDAYS },
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

    const weekly: WeeklyCalendar = {
      monday: [],
      tuesday: [],
      wednesday: [],
      thursday: [],
      friday: [],
      holidays: { ...EMPTY_HOLIDAYS },
    };

    const holidayDays = new Set<DayKey>();
    const holidayOverrideDays = new Set<DayKey>();

    for (const cal of calendars) {
      if (!cal.id) continue;
      const calIsHoliday = isHolidayCalendar(cal.id, cal.summary ?? "");

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
          const name = item.summary;

          if (isAllDay) {
            // 終日イベント: 祝日判定
            const dayKey = getDayKeyFromDate(item.start?.date ?? "");
            if (dayKey) {
              if (name.includes("休日出勤")) {
                // 休日出勤 → 出勤扱い（祝日を上書き）
                holidayOverrideDays.add(dayKey);
              } else if (
                calIsHoliday ||
                name.includes("休日") ||
                name === "休み"
              ) {
                // 祝日カレンダー or 「休日」イベント → 休み
                holidayDays.add(dayKey);
              }
            }
            // 終日予定はタスク一覧には追加しない
            continue;
          }

          // 通常イベント: 曜日ごとに振り分け
          const dayKey = getDayKeyFromDateTime(item.start?.dateTime ?? "");
          if (!dayKey) continue;

          weekly[dayKey].push({
            id: item.id ?? "",
            summary: name,
            start: item.start?.dateTime ?? "",
            end: item.end?.dateTime ?? "",
            allDay: false,
          });
        }
      } catch {
        // 個別カレンダーのエラーはスキップ
      }
    }

    // 「休日出勤」があれば祝日フラグを取り消す
    for (const dayKey of DAY_KEYS) {
      weekly.holidays[dayKey] =
        holidayDays.has(dayKey) && !holidayOverrideDays.has(dayKey);
    }

    return NextResponse.json(weekly);
  } catch (e) {
    console.error("Calendar API error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
