import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getRefreshToken } from "@/lib/db";
import { DayKey, WeeklyCalendar } from "@/types";

const DAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const WEEKEND_KEYS: DayKey[] = ["saturday", "sunday"];

const LEAVE_KEYWORDS = [
  "振休",
  "有休",
  "有給",
  "代休",
  "休暇",
  "休日",
  "休み",
  "公休",
  "全休",
  "特休",
];

/** 日付文字列 "YYYY-MM-DD" から曜日キーを返す */
function getDayKeyFromDate(dateStr: string): DayKey | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const day = new Date(y, m - 1, d).getDay(); // 0=日
  if (day === 0) return "sunday";
  return DAY_KEYS[day - 1];
}

/** ISO 日時文字列を JST に換算して曜日キーを返す */
function getDayKeyFromDateTime(isoString: string): DayKey | null {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  const jstDay = new Date(d.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
  if (jstDay === 0) return "sunday";
  return DAY_KEYS[jstDay - 1];
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

/** 休日出勤（出勤扱いに上書き） */
function isWorkdayOverride(name: string): boolean {
  return name.includes("休日出勤");
}

/** お休みを示唆するタイトルか（「休日出勤」は除く） */
function isLeaveTitle(name: string): boolean {
  if (isWorkdayOverride(name)) return false;
  return LEAVE_KEYWORDS.some((k) => name.includes(k));
}

/** 時刻付き予定用: 「有休」「振休」などマーカーそのものに近いタイトルだけ */
function isLeaveMarkerTitle(name: string): boolean {
  if (isWorkdayOverride(name)) return false;
  const t = name.replace(/\s+/g, "");
  return LEAVE_KEYWORDS.some(
    (k) =>
      t === k ||
      t === `${k}日` ||
      t === `終日${k}` ||
      t.startsWith(`${k}（`) ||
      t.startsWith(`${k}(`)
  );
}

const EMPTY_HOLIDAYS: Record<DayKey, boolean> = {
  monday: false,
  tuesday: false,
  wednesday: false,
  thursday: false,
  friday: false,
  saturday: true,
  sunday: true,
};

function emptyWeekly(): WeeklyCalendar {
  return {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
    holidays: { ...EMPTY_HOLIDAYS },
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const weekStart = searchParams.get("week_start");

  if (!weekStart) {
    return NextResponse.json({ error: "week_start required" }, { status: 400 });
  }

  const refreshToken = await getRefreshToken().catch(() => null);
  if (!refreshToken) {
    return NextResponse.json(emptyWeekly());
  }

  // 月曜 00:00 JST 〜 翌月曜 00:00 JST（土日含む）
  const timeMin = new Date(`${weekStart}T00:00:00+09:00`);
  const timeMax = new Date(timeMin.getTime() + 7 * 24 * 60 * 60 * 1000);

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!
  );
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: "v3", auth: oauth2Client });

  try {
    const calendarList = await calendar.calendarList.list();
    const calendars = calendarList.data.items ?? [];

    const weekly = emptyWeekly();
    const holidayDays = new Set<DayKey>();
    const holidayOverrideDays = new Set<DayKey>();

    for (const cal of calendars) {
      if (!cal.id) continue;
      const calIsHoliday = isHolidayCalendar(cal.id, cal.summary ?? "");

      try {
        const res = await calendar.events.list({
          calendarId: cal.id,
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        });

        for (const item of res.data.items ?? []) {
          const isAllDay = !!item.start?.date && !item.start?.dateTime;
          const name = item.summary ?? "";
          const isOutOfOffice = item.eventType === "outOfOffice";

          // タイトル無しは基本スキップ（外出中だけは休み判定に使う）
          if (!name && !isOutOfOffice) continue;

          if (isAllDay || isOutOfOffice) {
            const dayKey = isAllDay
              ? getDayKeyFromDate(item.start?.date ?? "")
              : getDayKeyFromDateTime(
                  item.start?.dateTime ?? item.start?.date ?? ""
                );
            if (!dayKey) continue;

            if (name && isWorkdayOverride(name)) {
              holidayOverrideDays.add(dayKey);
            } else if (calIsHoliday || isOutOfOffice || isLeaveTitle(name)) {
              holidayDays.add(dayKey);
            }
            // 終日・外出中はタスク一覧には入れない
            continue;
          }

          // 通常イベント: 曜日ごとに振り分け
          const dayKey = getDayKeyFromDateTime(item.start?.dateTime ?? "");
          if (!dayKey) continue;

          if (isWorkdayOverride(name)) {
            holidayOverrideDays.add(dayKey);
          } else if (isLeaveMarkerTitle(name)) {
            // 時刻付きでも「有休」「振休」等のマーカーならその日を休みに
            holidayDays.add(dayKey);
          }

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

    // 平日: 祝日/休暇フラグ。土日: デフォルト休み。「休日出勤」で出勤上書き
    for (const dayKey of DAY_KEYS) {
      const isWeekend = WEEKEND_KEYS.includes(dayKey);
      weekly.holidays[dayKey] =
        (isWeekend || holidayDays.has(dayKey)) &&
        !holidayOverrideDays.has(dayKey);
    }

    return NextResponse.json(weekly);
  } catch (e) {
    console.error("Calendar API error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
