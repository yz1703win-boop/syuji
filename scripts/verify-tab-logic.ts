/**
 * 4タブ（始業 / 終業 / 週次 / 残業）の純ロジック・スモーク検証。
 * 使い方: npm run verify:tabs
 * または: node --experimental-strip-types scripts/verify-tab-logic.ts
 */
import { buildScheduleSlots } from "../src/lib/schedule";
import { getOvertimeMinutes } from "../src/lib/overtime-calc";
import {
  addDays,
  getEveningDateJST,
  getTodayJST,
  getWeekStart,
  shouldIncludeOvertimeEvent,
  toDateString,
} from "../src/lib/template";
import type { CalendarEvent } from "../src/types";

type Case = { name: string; ok: boolean; detail?: string };

function jstIso(date: string, hour: number, min = 0): string {
  const hh = String(hour).padStart(2, "0");
  const mm = String(min).padStart(2, "0");
  return new Date(`${date}T${hh}:${mm}:00+09:00`).toISOString();
}

function ev(
  summary: string,
  start: string,
  end: string,
  allDay = false
): CalendarEvent {
  return { id: summary, summary, start, end, allDay };
}

const cases: Case[] = [];

function check(name: string, ok: boolean, detail?: string) {
  cases.push({ name, ok, detail });
}

// ─── morning: 9時前開始は9時マスに表示 ───
{
  const date = "2026-08-14";
  const events = [
    ev("早朝A", jstIso(date, 8, 0), jstIso(date, 10, 0)),
    ev("通常B", jstIso(date, 10, 0), jstIso(date, 11, 0)),
    ev("窓外C", jstIso(date, 8, 0), jstIso(date, 8, 30)),
  ];
  const slots = buildScheduleSlots(events, "morning");
  check(
    "morning: 8-10時予定が9:00マスに出る",
    slots.plan.get(9 * 60) === "早朝A"
  );
  check(
    "morning: 10時予定はそのまま",
    slots.plan.get(10 * 60) === "通常B"
  );
  check(
    "morning: 9時前に終わる予定は出ない",
    !slots.plan.has(8 * 60) && ![...slots.plan.values()].includes("窓外C")
  );
  check("morning: progress は空", slots.progress.size === 0);
}

// ─── evening: 左列は DB スナップショットのみ、右列は実績 ───
{
  const date = "2026-08-14";
  const planOverride = new Map<number, string>([[9 * 60, "始業時の予定X"]]);
  const events = [
    ev("実績Y", jstIso(date, 9, 0), jstIso(date, 10, 0)),
    ev("早朝Z", jstIso(date, 8, 0), jstIso(date, 10, 0)),
  ];
  const withPlan = buildScheduleSlots(events, "evening", {
    planOverride,
    windowOverride: { startMin: 9 * 60, endMin: 22 * 60 },
  });
  check(
    "evening: planOverride が左列に残る",
    withPlan.plan.get(9 * 60) === "始業時の予定X"
  );
  check(
    "evening: ライブ予定で左列を上書きしない",
    ![...withPlan.plan.values()].some((v) => v.includes("実績Y"))
  );
  const progressAt9 = withPlan.progress.get(9 * 60) ?? "";
  check(
    "evening: 右列に実績が入る",
    progressAt9.includes("実績Y")
  );
  check(
    "evening: 右列でも9時前開始は9時から",
    progressAt9.includes("早朝Z")
  );

  const noPlan = buildScheduleSlots(events, "evening");
  check(
    "evening: planOverride 無しでは左列をライブで埋めない",
    noPlan.plan.size === 0
  );
  check(
    "evening: planOverride 無しでも右列は埋まる",
    noPlan.progress.size > 0
  );
}

// ─── overtime: 18時跨ぎは重なり分のみ ───
{
  const date = "2026-08-14";
  check(
    "overtime: 17-19 → 60分",
    getOvertimeMinutes(jstIso(date, 17), jstIso(date, 19)) === 60
  );
  check(
    "overtime: 18-19 → 60分",
    getOvertimeMinutes(jstIso(date, 18), jstIso(date, 19)) === 60
  );
  check(
    "overtime: 17-17:30 → 0分",
    getOvertimeMinutes(jstIso(date, 17), jstIso(date, 17, 30)) === 0
  );
  check(
    "overtime: 19-21 → 120分",
    getOvertimeMinutes(jstIso(date, 19), jstIso(date, 21)) === 120
  );
  check(
    "overtime: 除外ワード「移動」",
    shouldIncludeOvertimeEvent("移動 渋谷") === false
  );
  check(
    "overtime: 通常タスクは含む",
    shouldIncludeOvertimeEvent("実装レビュー") === true
  );
}

// ─── weekly: 週開始（月曜起点） ───
{
  // 2026-08-12 は水曜
  const wed = new Date("2026-08-12T12:00:00+09:00");
  // getWeekStart uses local Date methods — feed a Date whose local components match JST intent
  const localWed = new Date(2026, 7, 12, 12, 0, 0); // month 0-indexed
  const ws = getWeekStart(localWed);
  check(
    "weekly: 水曜から見た週開始は月曜",
    ws.getFullYear() === 2026 && ws.getMonth() === 7 && ws.getDate() === 10
  );
  void wed;
}

// ─── date helpers: evening は 7 時前に前日 ───
{
  const today = getTodayJST();
  const evening = getEveningDateJST();
  const jstHour = new Date(
    Date.now() + 9 * 60 * 60 * 1000
  ).getUTCHours();
  if (jstHour < 7) {
    const expected = toDateString(addDays(today, -1));
    check(
      "date: 7時前は evening が前日",
      toDateString(evening) === expected,
      `evening=${toDateString(evening)} expected=${expected}`
    );
  } else {
    check(
      "date: 7時以降は evening が今日",
      toDateString(evening) === toDateString(today),
      `evening=${toDateString(evening)} today=${toDateString(today)}`
    );
  }
}

const failed = cases.filter((c) => !c.ok);
for (const c of cases) {
  const mark = c.ok ? "PASS" : "FAIL";
  console.log(`${mark}  ${c.name}${c.detail ? ` (${c.detail})` : ""}`);
}
console.log(`\n${cases.length - failed.length}/${cases.length} passed`);
if (failed.length > 0) {
  process.exit(1);
}
