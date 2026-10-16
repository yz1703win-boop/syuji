import { DayKey } from "@/types";

const DAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** YYYY-MM-DD を日数分ずらす（UTC 日付演算。サーバーTZに依存しない） */
export function addIsoDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** 日付文字列 "YYYY-MM-DD" から曜日キーを返す */
export function dayKeyFromIsoDate(dateStr: string): DayKey | null {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const day = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  if (day === 0) return "sunday";
  return DAY_KEYS[day - 1];
}

/** start 以上 end 未満の日付。不正なら空 */
export function enumerateIsoDates(
  startInclusive: string,
  endExclusive: string
): string[] {
  if (!startInclusive || !endExclusive || startInclusive >= endExclusive) {
    return [];
  }
  const dates: string[] = [];
  let cur = startInclusive;
  while (cur < endExclusive && dates.length < 366) {
    dates.push(cur);
    cur = addIsoDays(cur, 1);
  }
  return dates;
}

/**
 * Google カレンダー終日予定が覆う日。
 * end.date は排他。無い・開始以前なら開始日だけ。
 */
export function allDayCoveredDates(
  startDate: string,
  endDate?: string | null
): string[] {
  if (!startDate) return [];
  if (!endDate || endDate <= startDate) return [startDate];
  return enumerateIsoDates(startDate, endDate);
}

function jstDateStringFromIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 時刻付き予定が重なる JST の日付。終了ちょうどの日は含めない。
 * 複数日の外出中（00:00〜翌々日 00:00 など）を日ごとに展開する。
 */
export function dateTimeCoveredDates(startIso: string, endIso: string): string[] {
  const startDate = jstDateStringFromIso(startIso);
  if (!startDate) return [];
  const end = new Date(endIso);
  if (Number.isNaN(end.getTime())) return [startDate];
  const endInclusive = new Date(end.getTime() - 1);
  const endDate = jstDateStringFromIso(endInclusive.toISOString());
  if (!endDate || endDate < startDate) return [startDate];
  return enumerateIsoDates(startDate, addIsoDays(endDate, 1));
}

/** 月曜始まりの週（7日）に含まれる日付だけ残す */
export function datesWithinWeek(dates: string[], weekStart: string): string[] {
  const weekEnd = addIsoDays(weekStart, 7);
  return dates.filter((d) => d >= weekStart && d < weekEnd);
}
