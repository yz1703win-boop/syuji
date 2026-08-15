import { CalendarEvent } from "@/types";

/** グリッド表示: 左 7–15時 / 右 16–0時 */
export const LEFT_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
export const RIGHT_HOURS = [16, 17, 18, 19, 20, 21, 22, 23, 0] as const;
export const SLOTS_PER_HOUR = 4;

const BASE_START_MIN = 9 * 60;
const AM_LEAVE_BASE_MIN = 14 * 60;
const HARD_END_MIN = 22 * 60;
const HALF_DAY_DURATION_MIN = 4 * 60;

export type ScheduleMode = "morning" | "evening";

export interface TimeWindow {
  startMin: number;
  endMin: number;
}

export interface ScheduleSlots {
  /** key: 分（0–1439）、value: そのマスの予定名（複数は改行） */
  plan: Map<number, string>;
  progress: Map<number, string>;
  window: TimeWindow;
}

/** UTC ISO から JST の「その日の分」を返す */
export function getJSTMinutesOfDay(isoString: string): number {
  const d = new Date(isoString);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}

export function floorTo15(minutes: number): number {
  return Math.floor(minutes / 15) * 15;
}

/** 「趣味」「私用」「18時以降の移動」を除外（部分一致） */
export function shouldIncludeScheduleEvent(event: CalendarEvent): boolean {
  const name = event.summary;
  if (name.includes("趣味") || name.includes("私用")) return false;
  if (!event.allDay && name.includes("移動")) {
    if (getJSTMinutesOfDay(event.start) >= 18 * 60) return false;
  }
  return true;
}

function parseFlexHours(summary: string, kind: "早フレ" | "遅フレ"): number {
  if (!summary.includes(kind)) return 0;
  const m = summary.match(new RegExp(`${kind}\\s*(\\d+)\\s*時間`));
  return m ? parseInt(m[1], 10) : 0;
}

/** 終日予定からフレックス／半休マーカーを読み、取り込み窓を計算 */
export function computeTimeWindow(events: CalendarEvent[]): TimeWindow {
  let earlyHours = 0;
  let lateHours = 0;
  let amLeave = false;
  let pmLeave = false;

  for (const e of events) {
    if (!e.allDay) continue;
    const s = e.summary;
    earlyHours = Math.max(earlyHours, parseFlexHours(s, "早フレ"));
    lateHours = Math.max(lateHours, parseFlexHours(s, "遅フレ"));
    if (s.includes("午前休")) amLeave = true;
    if (s.includes("午後休")) pmLeave = true;
  }

  const flexOffset = lateHours * 60 - earlyHours * 60;
  const workStart = BASE_START_MIN + flexOffset;

  if (amLeave) {
    const startMin = AM_LEAVE_BASE_MIN + flexOffset;
    return { startMin, endMin: startMin + HALF_DAY_DURATION_MIN };
  }
  if (pmLeave) {
    return { startMin: workStart, endMin: workStart + HALF_DAY_DURATION_MIN };
  }

  return { startMin: workStart, endMin: HARD_END_MIN };
}

function inWindow(startMin: number, window: TimeWindow): boolean {
  return startMin >= window.startMin && startMin < window.endMin;
}

/** イベント終了（分）。日付跨ぎは +24h して開始より後にする */
function getEventEndMin(event: CalendarEvent, startMin: number): number {
  const endMin = getJSTMinutesOfDay(event.end);
  return endMin <= startMin ? endMin + 24 * 60 : endMin;
}

/**
 * 勤務窓と重なる予定の表示開始マス。
 * 9時前開始でも窓開始（通常9:00）から表示する。
 */
function clippedDisplayStart(
  startMin: number,
  endMin: number,
  window: TimeWindow
): number | null {
  if (endMin <= window.startMin) return null;
  if (startMin >= window.endMin) return null;
  const clipped = Math.max(startMin, window.startMin);
  if (clipped >= window.endMin) return null;
  return clipped;
}

function addToSlot(map: Map<number, string>, slotMin: number, title: string) {
  const prev = map.get(slotMin);
  map.set(slotMin, prev ? `${prev}\n${title}` : title);
}

export function serializeSlotMap(map: Map<number, string>): string {
  return JSON.stringify(Object.fromEntries(map));
}

export function deserializeSlotMap(json: string): Map<number, string> {
  const obj = JSON.parse(json) as Record<string, string>;
  return new Map(
    Object.entries(obj).map(([k, v]) => [Number(k), v] as [number, string])
  );
}

export interface BuildScheduleSlotsOptions {
  /** 始業時に保存した「今日の予定」。終業の左列に使う */
  planOverride?: Map<number, string>;
  windowOverride?: TimeWindow;
}

/**
 * 今日の予定・実際の進行スロットを構築する。
 * - 終日はマスに出さない（窓判定専用）
 * - 始業: progress は空。窓より前開始の予定は窓開始マスに表示
 * - 終業: 左列は planOverride（始業時スナップショット）のみ。ライブ予定では埋めない
 *         progress は22時（または勤務窓終端）まで。窓より前開始も窓開始から表示
 */
export function buildScheduleSlots(
  events: CalendarEvent[],
  mode: ScheduleMode,
  options?: BuildScheduleSlotsOptions
): ScheduleSlots {
  const liveWindow = computeTimeWindow(events);
  const window = options?.windowOverride ?? liveWindow;
  const plan = options?.planOverride
    ? new Map(options.planOverride)
    : new Map<number, string>();
  const progress = new Map<number, string>();

  // 終業は常に当日22時（勤務窓終端）までの実績。深夜に前日分を書く場合も now に引きずられない
  const progressEnd = Math.min(HARD_END_MIN, liveWindow.endMin);
  const progressWindow = liveWindow;

  for (const event of events) {
    if (event.allDay) continue;
    if (!shouldIncludeScheduleEvent(event)) continue;

    const rawStartMin = floorTo15(getJSTMinutesOfDay(event.start));
    if (rawStartMin >= HARD_END_MIN) continue;

    const endMin = getEventEndMin(event, rawStartMin);

    // 始業の「今日の予定」のみライブから構築。終業の左列は DB スナップショット専用
    if (mode === "morning" && !options?.planOverride) {
      const planStart = clippedDisplayStart(rawStartMin, endMin, window);
      if (planStart !== null) {
        addToSlot(plan, planStart, event.summary);
      }
    }

    if (mode === "evening") {
      const progStart = clippedDisplayStart(
        rawStartMin,
        endMin,
        progressWindow
      );
      if (
        progStart !== null &&
        progStart <= progressEnd &&
        inWindow(progStart, progressWindow)
      ) {
        addToSlot(progress, progStart, event.summary);
      }
    }
  }

  return { plan, progress, window };
}

export function hourSlotKeys(hour: number): number[] {
  const base = hour * 60;
  return [0, 1, 2, 3].map((i) => base + i * 15);
}
