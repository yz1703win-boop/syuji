/**
 * 4タブ（始業 / 終業 / 週次 / 残業）の純ロジック・スモーク検証。
 * 使い方: npm run verify:tabs
 * または: node --experimental-strip-types scripts/verify-tab-logic.ts
 */
import {
  buildScheduleSlots,
  personalOrTravelCutoffMin,
} from "../src/lib/schedule";
import { getOvertimeMinutes } from "../src/lib/overtime-calc";
import {
  allDayCoveredDates,
  dateTimeCoveredDates,
  datesWithinWeek,
  dayKeyFromIsoDate,
} from "../src/lib/calendar-span";
import {
  addDays,
  buildOvertimeVars,
  buildTaskTimeSummary,
  buildWeekendWorkSections,
  buildWeeklyVars,
  formatEventsForTaskList,
  getEveningDateJST,
  getTodayJST,
  getWeekStart,
  isHolidayWorkTitle,
  selectOvertimeEvents,
  shouldIncludeOvertimeEvent,
  toDateString,
} from "../src/lib/template";
import type { CalendarEvent, WeeklyCalendar } from "../src/types";

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

// ─── 早フレだけ 8:00 開始。終日は 9:00 のまま ───
{
  const date = "2026-08-14";
  const earlyOnly = [
    ev("早フレ", `${date}`, `${date}`, true),
    ev("8時タスク", jstIso(date, 8, 0), jstIso(date, 9, 0)),
    ev("21時タスク", jstIso(date, 21, 0), jstIso(date, 22, 0)),
    ev("7時タスク", jstIso(date, 7, 0), jstIso(date, 8, 0)),
    ev("私用", jstIso(date, 21, 30), jstIso(date, 22, 0)),
  ];
  const slots = buildScheduleSlots(earlyOnly, "morning");
  check(
    "早フレ: 8時開始のタスクが8:00マスに出る",
    slots.plan.get(8 * 60) === "8時タスク" && slots.window.startMin === 8 * 60
  );
  check(
    "早フレ: 21時タスクは出る",
    slots.plan.get(21 * 60) === "21時タスク"
  );
  check(
    "早フレ: 8時前に終わるタスクは出ない",
    ![...slots.plan.values()].includes("7時タスク")
  );
  check(
    "早フレ: 私用そのものは出ない",
    ![...slots.plan.values()].some((v) => v.includes("私用"))
  );

  const fullDay = [
    ev("終日", `${date}`, `${date}`, true),
    ev("8時だけ", jstIso(date, 8, 0), jstIso(date, 9, 0)),
    ev("8時から続く", jstIso(date, 8, 0), jstIso(date, 10, 0)),
  ];
  const fullSlots = buildScheduleSlots(fullDay, "morning");
  check(
    "終日: 8時開始にはせず、8時前に終わるタスクは出ない",
    fullSlots.window.startMin === 9 * 60 &&
      !fullSlots.plan.has(8 * 60) &&
      ![...fullSlots.plan.values()].includes("8時だけ") &&
      fullSlots.plan.get(9 * 60) === "8時から続く"
  );

  const twoHour = [
    ev("早フレ2時間", `${date}`, `${date}`, true),
    ev("7時タスク", jstIso(date, 7, 0), jstIso(date, 8, 0)),
  ];
  const twoSlots = buildScheduleSlots(twoHour, "morning");
  check(
    "早フレ2時間: 7時タスクが出る",
    twoSlots.window.startMin === 7 * 60 &&
      twoSlots.plan.get(7 * 60) === "7時タスク"
  );
}

// ─── 私用・移動の後のタスクは日報に出さない ───
{
  const date = "2026-08-14";
  const events = [
    ev("午前作業", jstIso(date, 10, 0), jstIso(date, 11, 0)),
    ev("移動 帰宅", jstIso(date, 18, 0), jstIso(date, 18, 30)),
    ev("夜の作業", jstIso(date, 19, 0), jstIso(date, 21, 0)),
    ev("夕方作業", jstIso(date, 16, 0), jstIso(date, 17, 0)),
  ];
  const slots = buildScheduleSlots(events, "evening");
  const progress = [...slots.progress.values()].join("\n");
  check(
    "日報: 移動より前のタスクは出る",
    progress.includes("午前作業") && progress.includes("夕方作業")
  );
  check(
    "日報: 移動の後のタスクは出ない",
    !progress.includes("夜の作業") && !progress.includes("移動")
  );
  check(
    "cutoff: 最も早い私用・移動の開始",
    personalOrTravelCutoffMin(events) === 18 * 60
  );

  const earlierPersonal = [
    ev("朝タスク", jstIso(date, 9, 0), jstIso(date, 10, 0)),
    ev("私用", jstIso(date, 15, 0), jstIso(date, 16, 0)),
    ev("私用の後", jstIso(date, 16, 0), jstIso(date, 18, 0)),
    ev("夜残業", jstIso(date, 19, 0), jstIso(date, 21, 0)),
  ];
  const after = buildScheduleSlots(earlierPersonal, "morning");
  check(
    "日報: 私用の後のタスクは出ない",
    after.plan.get(9 * 60) === "朝タスク" &&
      ![...after.plan.values()].some(
        (v) => v.includes("私用の後") || v.includes("夜残業")
      )
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
    "overtime: 除外ワード「私用」（完全一致）",
    shouldIncludeOvertimeEvent("私用") === false
  );
  check(
    "overtime: 除外ワード「私用」（部分一致）",
    shouldIncludeOvertimeEvent("私用・買い物") === false
  );
  check(
    "overtime: 除外ワード「趣味」（部分一致）",
    shouldIncludeOvertimeEvent("趣味：ゲーム") === false
  );
  check(
    "overtime: 通常タスクは含む",
    shouldIncludeOvertimeEvent("実装レビュー") === true
  );
  // 私用・趣味を除いたイベントだけで残業合計が組まれること
  {
    const mixed = [
      { summary: "実装レビュー", durationMinutes: 60 },
      { summary: "デプロイ", durationMinutes: 30 },
      { summary: "私用（事業）", durationMinutes: 45 },
      { summary: "趣味：ゲーム", durationMinutes: 90 },
    ];
    // API側フィルタを通さず buildOvertimeVars に直接渡しても除外されること
    const vars = buildOvertimeVars(mixed, 0);
    check(
      "overtime: 私用（事業）・趣味は合計・一覧から除外",
      vars.today_overtime === "1時間30分" &&
        !vars.overtime_tasks.includes("私用") &&
        !vars.overtime_tasks.includes("趣味") &&
        vars.overtime_tasks.includes("実装レビュー")
    );
  }

  const afterTravel = selectOvertimeEvents([
    ev("夕方作業", jstIso(date, 17, 0), jstIso(date, 19, 0)),
    ev("移動 帰宅", jstIso(date, 19, 0), jstIso(date, 19, 30)),
    ev("夜の作業", jstIso(date, 20, 0), jstIso(date, 22, 0)),
  ]);
  check(
    "overtime: 移動より前のタスクは重なり分だけ残る",
    afterTravel.length === 1 &&
      afterTravel[0].summary === "夕方作業" &&
      afterTravel[0].durationMinutes === 60
  );
  check(
    "overtime: 移動の後のタスクは含めない",
    !afterTravel.some((e) => e.summary === "夜の作業")
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

// ─── weekly: 休出の日は勤務日としてタスクと時間を出す ───
{
  const date = "2026-08-15"; // 土曜
  check("weekly: 休出は勤務日マーカー", isHolidayWorkTitle("休出") === true);
  check(
    "weekly: 休日出勤も勤務日マーカー",
    isHolidayWorkTitle("休日出勤") === true
  );

  const task = ev("モニター確認", jstIso(date, 10, 0), jstIso(date, 11, 30));
  const marker = ev("休出", jstIso(date, 9, 0), jstIso(date, 18, 0));
  const list = formatEventsForTaskList([marker, task], false);
  check(
    "weekly: 休出の日のタスクと分数が出て、休出自体は出ない",
    list.includes("・モニター確認（90）") && !list.includes("休出")
  );

  const holidays = {
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
    sunday: true,
  };
  const calendar: WeeklyCalendar = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [marker, task],
    sunday: [],
    holidays,
  };
  const weekStart = new Date(2026, 7, 10);
  const weekend = buildWeekendWorkSections(weekStart, calendar);
  check(
    "weekly: 休出の土曜が週次タスク欄に出る",
    weekend.includes("8/15(土)") && weekend.includes("・モニター確認（90）")
  );
  const summary = buildTaskTimeSummary(calendar);
  check(
    "weekly: 休出のタスク時間が所要時間に入る",
    summary.includes("・モニター確認(90)") && !summary.includes("休出")
  );
}

// ─── weekly: 複数日の終日有給は期間の全日を休みにし、タスクも出す ───
{
  const covered = allDayCoveredDates("2026-10-13", "2026-10-16");
  const inWeek = datesWithinWeek(covered, "2026-10-12");
  const keys = inWeek.map((d) => dayKeyFromIsoDate(d)).join(",");
  check(
    "weekly: 10/13-15の終日は13・14・15を覆う",
    covered.join(",") === "2026-10-13,2026-10-14,2026-10-15" &&
      keys === "tuesday,wednesday,thursday"
  );

  const ooo = dateTimeCoveredDates(
    "2026-10-13T00:00:00+09:00",
    "2026-10-16T00:00:00+09:00"
  );
  check(
    "weekly: 複数日の外出中も終了日の前日まで",
    ooo.join(",") === "2026-10-13,2026-10-14,2026-10-15"
  );

  const cross = datesWithinWeek(
    allDayCoveredDates("2026-10-11", "2026-10-14"),
    "2026-10-12"
  );
  check(
    "weekly: 週をまたぐ終日は当週の日だけ",
    cross.join(",") === "2026-10-12,2026-10-13"
  );

  const wedTask = ev(
    "打ち合わせ",
    jstIso("2026-10-14", 10, 0),
    jstIso("2026-10-14", 11, 0)
  );
  const thuTask = ev(
    "資料作成",
    jstIso("2026-10-15", 13, 0),
    jstIso("2026-10-15", 15, 0)
  );
  const leave = ev("有給", "2026-10-13", "2026-10-16", true);
  const holidayList = formatEventsForTaskList([leave, wedTask], true);
  check(
    "weekly: 休みの日は「休み」とタスクを両方出す",
    holidayList === "休み\n・打ち合わせ（60）" && !holidayList.includes("有給")
  );
  check(
    "weekly: 休みで他タスクが無ければ「休み」のみ",
    formatEventsForTaskList([leave], true) === "休み"
  );

  const holidays = {
    monday: false,
    tuesday: true,
    wednesday: true,
    thursday: true,
    friday: false,
    saturday: true,
    sunday: true,
  };
  const calendar: WeeklyCalendar = {
    monday: [],
    tuesday: [leave],
    wednesday: [wedTask],
    thursday: [thuTask],
    friday: [],
    saturday: [],
    sunday: [],
    holidays,
  };
  const vars = buildWeeklyVars(new Date(2026, 9, 12), calendar);
  check(
    "weekly: 連続有給の14日・15日は休み表記でタスクも出る",
    vars.tuesday_events === "休み" &&
      vars.wednesday_events === "休み\n・打ち合わせ（60）" &&
      vars.thursday_events === "休み\n・資料作成（120）"
  );
  const summary = buildTaskTimeSummary(calendar);
  check(
    "weekly: 休み期間のタスクは所要時間に入れない",
    !summary.includes("打ち合わせ") && !summary.includes("資料作成")
  );
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
