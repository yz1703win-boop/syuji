import { CalendarEvent, DayKey, WeeklyCalendar } from "@/types";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

/** サーバー・クライアント両方で日本時間の「今日」を返す */
export function getTodayJST(): Date {
  const now = new Date();
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
}

/** 終業日報用の日付（JST 7時前は前日扱い） */
export function getEveningDateJST(): Date {
  const now = new Date();
  const jstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const jstHour = jstNow.getUTCHours();
  const base = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
  if (jstHour < 7) {
    base.setDate(base.getDate() - 1);
  }
  return base;
}

/** 日付を日数分ずらす（元の Date は変更しない） */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatDate(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
  return `${m}月${d}日(${w})`;
}

export function formatShortDate(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const w = WEEKDAYS[date.getDay() === 0 ? 6 : date.getDay() - 1];
  return `${m}/${d}(${w})`;
}

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();

  // 日曜23:30以降は「翌週の月曜」として扱う
  if (
    day === 0 &&
    (d.getHours() > 23 || (d.getHours() === 23 && d.getMinutes() >= 30))
  ) {
    const nextMonday = new Date(d);
    nextMonday.setDate(d.getDate() + 1);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
  }

  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekDays(weekStart: Date): Date[] {
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** UTC の ISO 文字列から JST の時間（0〜23）を返す */
function getJSTHour(isoString: string): number {
  const d = new Date(isoString);
  return (d.getUTCHours() + 9) % 24;
}

/** 「趣味」「私用」「飯」「飯系」「風呂」「休日出勤」「休暇マーカー」「18時以降の移動」を除外 */
function shouldIncludeEvent(event: CalendarEvent): boolean {
  const name = event.summary;
  if (
    name.includes("趣味") ||
    name.includes("私用") ||
    name.includes("飯") ||
    name.includes("風呂") ||
    name.includes("休日出勤") ||
    name.includes("振休") ||
    name.includes("有休") ||
    name.includes("有給") ||
    name.includes("代休") ||
    name.includes("公休") ||
    name.includes("全休") ||
    name.includes("特休")
  )
    return false;
  if (!event.allDay && name.includes("移動")) {
    if (getJSTHour(event.start) >= 18) return false;
  }
  return true;
}

/** イベントの所要時間（分）を返す。終日・無効な場合は 0 */
function getEventDurationMinutes(event: CalendarEvent): number {
  if (event.allDay) return 0;
  const start = new Date(event.start).getTime();
  const end = new Date(event.end).getTime();
  const mins = Math.round((end - start) / 60000);
  return mins > 0 ? mins : 0;
}

/** ▼タスク目標用：タスク名のみ（時刻なし）のリスト。休日は「休み」 */
export function formatEventsForTaskList(
  events: CalendarEvent[] | undefined,
  isHoliday: boolean
): string {
  if (isHoliday) return "休み";
  const filtered = (events ?? []).filter(shouldIncludeEvent);
  if (filtered.length === 0) return "（予定なし）";
  return filtered.map((e) => `・${e.summary}`).join("\n");
}

const WEEKDAY_KEYS: DayKey[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

const ALL_DAY_KEYS: DayKey[] = [
  ...WEEKDAY_KEYS,
  "saturday",
  "sunday",
];

/** 週の期間表示（月〜金。休日出勤の土日があればそこまで伸ばす） */
export function buildWeekRange(
  weekStart: Date,
  calendar: WeeklyCalendar
): string {
  let endOffset = 4; // 金曜
  if (!calendar.holidays.saturday) endOffset = 5;
  if (!calendar.holidays.sunday) endOffset = 6;
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + endOffset);
  return `${formatShortDate(weekStart)}～${formatShortDate(end)}`;
}

/** 休日出勤がある土日のタスク目標ブロック（無ければ空文字） */
export function buildWeekendWorkSections(
  weekStart: Date,
  calendar: WeeklyCalendar
): string {
  const parts: string[] = [];
  const weekend: { key: DayKey; offset: number }[] = [
    { key: "saturday", offset: 5 },
    { key: "sunday", offset: 6 },
  ];

  for (const { key, offset } of weekend) {
    // 土日はデフォルト休み。休日出勤で holidays=false のときだけ出す
    if (calendar.holidays[key]) continue;
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + offset);
    parts.push(
      `〇${formatShortDate(d)}\n${formatEventsForTaskList(calendar[key], false)}`
    );
  }

  return parts.length > 0 ? `\n${parts.join("\n\n")}\n` : "";
}

/** タスク別所要時間セクション全体を生成する（休日の曜日は除外。休日出勤の土日は含む） */
export function buildTaskTimeSummary(calendar: WeeklyCalendar): string {
  const allEvents = ALL_DAY_KEYS.filter((k) => !calendar.holidays[k])
    .flatMap((k) => calendar[k])
    .filter(shouldIncludeEvent);

  // 名前ごとに合計時間を集計
  const taskMap = new Map<string, number>();
  for (const event of allEvents) {
    const duration = getEventDurationMinutes(event);
    if (duration <= 0) continue;
    taskMap.set(event.summary, (taskMap.get(event.summary) ?? 0) + duration);
  }

  // 各種連絡 → ルーティン（カレンダーになければ 720 固定）
  const contactDuration = taskMap.get("各種連絡") ?? 720;
  taskMap.delete("各種連絡");

  const routineTotal = contactDuration;
  const promoLines: string[] = [];
  let promoTotal = 0;

  for (const [name, duration] of taskMap) {
    promoLines.push(`・${name}(${duration})`);
    promoTotal += duration;
  }

  const total = routineTotal + promoTotal;
  const totalHours = Math.floor(total / 60);
  const totalMins = total % 60;

  const lines: string[] = [
    "＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝",
    "◎ルーティン",
    `・各種連絡(${contactDuration})`,
    "",
    `計：${routineTotal}`,
    "",
    "◎プロモタスク",
    ...(promoLines.length > 0
      ? promoLines
      : ["（カレンダー連携後に自動入力されます）"]),
    "",
    `計：${promoTotal}`,
    "",
    "＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝＝",
    `(合計：${total.toLocaleString()}分 ＝ ${totalHours}時間${totalMins}分)`,
  ];

  return lines.join("\n");
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return Object.entries(vars).reduce(
    (str, [key, val]) => str.replaceAll(`{{${key}}}`, val),
    template
  );
}

export function buildMorningVars(
  today: Date,
  goalUrl = ""
): Record<string, string> {
  return { date: formatDate(today), goal_url: goalUrl };
}

export function buildEveningVars(
  today: Date,
  goalUrl = "",
  resultUrl = ""
): Record<string, string> {
  return {
    date: formatDate(today),
    goal_url: goalUrl,
    result_url: resultUrl,
  };
}

const GYAZO_URL_RE = /https?:\/\/(?:i\.)?gyazo\.com\/[^\s\n]+/gi;

/** 始業: 何卒〜の下 / {{goal_url}} に日程URLを入れる・差し替え */
export function upsertMorningScheduleUrl(content: string, url: string): string {
  if (content.includes("{{goal_url}}")) {
    return content.replaceAll("{{goal_url}}", url);
  }

  const marker = "何卒よろしくお願いいたします。";
  const idx = content.indexOf(marker);
  if (idx === -1) {
    // マーカーが無い場合は末尾に追加
    const without = content.replace(GYAZO_URL_RE, "").trimEnd();
    return `${without}\n${url}`;
  }

  const before = content.slice(0, idx + marker.length);
  let after = content.slice(idx + marker.length);
  // 直後の Gyazo URL 行を除去して差し替え
  after = after.replace(/^\s*\n?(?:https?:\/\/(?:i\.)?gyazo\.com\/[^\s\n]+\s*\n?)*/i, "\n");
  return `${before}\n${url}${after.startsWith("\n") ? after : `\n${after}`}`;
}

/** 終業: 「2　本日の結果」下線の下 / {{result_url}} に日程URLを入れる・差し替え */
export function upsertEveningResultUrl(content: string, url: string): string {
  if (content.includes("{{result_url}}")) {
    return content.replaceAll("{{result_url}}", url);
  }

  const sectionRe =
    /(2　本日の結果\n[￣ー\-＝=]{8,}\n)((?:https?:\/\/(?:i\.)?gyazo\.com\/[^\s\n]+\n?)*)/;
  if (sectionRe.test(content)) {
    return content.replace(sectionRe, `$1${url}\n`);
  }

  // フォールバック: セクション見出しの直後に挿入
  const marker = "2　本日の結果";
  const idx = content.indexOf(marker);
  if (idx === -1) return `${content.trimEnd()}\n${url}`;

  const lineEnd = content.indexOf("\n", idx);
  if (lineEnd === -1) return `${content}\n${url}`;
  // 下線行の次へ
  const afterHeader = content.indexOf("\n", lineEnd + 1);
  if (afterHeader === -1) return `${content}\n${url}`;
  const before = content.slice(0, afterHeader + 1);
  let after = content.slice(afterHeader + 1);
  after = after.replace(/^(?:https?:\/\/(?:i\.)?gyazo\.com\/[^\s\n]+\s*\n?)*/i, "");
  return `${before}${url}\n${after}`;
}

export function buildWeeklyVars(
  weekStart: Date,
  calendar: WeeklyCalendar,
  prevWeekContent?: string
): Record<string, string> {
  const days = getWeekDays(weekStart);
  const { prev_action_change, prev_week_tasks } =
    extractPrevWeekSections(prevWeekContent);
  const weekRange = buildWeekRange(weekStart, calendar);
  // 既存DBテンプレートに {{weekend_work_sections}} が無くても出るよう、金曜の直後へ連結する
  const weekendSections = buildWeekendWorkSections(weekStart, calendar);

  return {
    prev_action_change,
    prev_week_tasks,
    diff: "特になし",
    action_change: "",
    monday_date: formatShortDate(days[0]),
    tuesday_date: formatShortDate(days[1]),
    wednesday_date: formatShortDate(days[2]),
    thursday_date: formatShortDate(days[3]),
    friday_date: formatShortDate(days[4]),
    monday_events: formatEventsForTaskList(calendar.monday, calendar.holidays.monday),
    tuesday_events: formatEventsForTaskList(calendar.tuesday, calendar.holidays.tuesday),
    wednesday_events: formatEventsForTaskList(calendar.wednesday, calendar.holidays.wednesday),
    thursday_events: formatEventsForTaskList(calendar.thursday, calendar.holidays.thursday),
    friday_events:
      formatEventsForTaskList(calendar.friday, calendar.holidays.friday) +
      weekendSections,
    weekend_work_sections: weekendSections,
    week_range: weekRange,
    task_time_section: buildTaskTimeSummary(calendar),
  };
}

export function extractPrevWeekSections(content?: string): {
  prev_action_change: string;
  prev_week_tasks: string;
} {
  if (!content) {
    return {
      prev_action_change: "（前週データなし）",
      prev_week_tasks: "（前週データなし）",
    };
  }

  // ３）行動変化 — 空欄時に \n+ が区切り改行を食わないよう lookahead は改行なし
  const actionMatch = content.match(
    /３）行動変化[^\n]*\n+([\s\S]*?)(?=４）|５）|$)/
  );

  // ▼タスク目標 — 同上（▼タスク別所要時間 / ５）まで）
  const tasksMatch = content.match(
    /▼タスク目標\n+([\s\S]*?)(?=▼\d|＝＝|５）|$)/
  );

  return {
    prev_action_change: actionMatch?.[1]?.trim() ?? "（抽出できませんでした）",
    prev_week_tasks: tasksMatch?.[1]?.trim() ?? "（抽出できませんでした）",
  };
}

/** 始業日報のテキストから URL を抽出する */
export function extractGoalUrls(morningContent: string): string {
  const urls = morningContent.match(/https?:\/\/[^\s\n]+/g);
  return urls ? urls.join("\n") : "";
}

// ─── 残業申請ヘルパー ────────────────────────────────────────

const OVERTIME_EXCLUDE_WORDS = ["移動", "趣味", "私用", "課題", "飯", "風呂"];

/** 残業申請に含めないイベントを除外（件名の部分一致）。除外分は時間合計にも含めない */
export function shouldIncludeOvertimeEvent(eventName: string): boolean {
  return !OVERTIME_EXCLUDE_WORDS.some((w) => eventName.includes(w));
}

/** 分数を「X時間Y分」形式に変換 */
export function formatMinutes(minutes: number): string {
  if (minutes === 0) return "0時間";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

/** コピー済み残業申請の content から「・残業時間⇒」の分数を取得（今月合計行は除外） */
export function parseOvertimeMinutes(content: string): number {
  // "・残業時間⇒X時間Y分" に限定（今月の現残業時間⇒ は除外）
  const match = content.match(/^・残業時間⇒(\d+)時間(\d+)?分?/m);
  if (!match) return 0;
  const h = parseInt(match[1]) || 0;
  const m = parseInt(match[2] ?? "0") || 0;
  return h * 60 + m;
}

/** コピー済み残業申請の content から「今月の現残業時間⇒」の分数を取得 */
export function parseTotalOvertimeFromContent(content: string): number {
  const match = content.match(/今月の現残業時間⇒(\d+)時間(\d+)?分?/);
  if (!match) return 0;
  const h = parseInt(match[1]) || 0;
  const m = parseInt(match[2] ?? "0") || 0;
  return h * 60 + m;
}

/** "46:55" や "46時間55分" などの入力を分数に変換 */
export function parseOvertimeSeedInput(input: string): number {
  const colonMatch = input.match(/^(\d+):(\d{2})$/);
  if (colonMatch) return parseInt(colonMatch[1]) * 60 + parseInt(colonMatch[2]);
  const japanMatch = input.match(/(\d+)時間(\d+)?分?/);
  if (japanMatch) {
    return parseInt(japanMatch[1]) * 60 + parseInt(japanMatch[2] ?? "0");
  }
  return 0;
}

export interface OvertimeEvent {
  summary: string;
  durationMinutes: number;
}

/** 残業申請テンプレート変数を生成（私用・趣味などは一覧からも時間合計からも除外） */
export function buildOvertimeVars(
  overtimeEvents: OvertimeEvent[],
  currentMonthMinutes: number
): Record<string, string> {
  const included = overtimeEvents.filter((e) =>
    shouldIncludeOvertimeEvent(e.summary)
  );
  const totalMinutes = included.reduce(
    (sum, e) => sum + e.durationMinutes,
    0
  );

  const tasks =
    included.length > 0
      ? included.map((e) => `${e.summary}(${e.durationMinutes})`).join("\n")
      : "なし";

  return {
    current_month_overtime: formatMinutes(currentMonthMinutes),
    today_overtime: formatMinutes(totalMinutes),
    overtime_tasks: tasks,
  };
}
