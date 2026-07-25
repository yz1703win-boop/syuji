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

function addToSlot(map: Map<number, string>, slotMin: number, title: string) {
  const prev = map.get(slotMin);
  map.set(slotMin, prev ? `${prev}\n${title}` : title);
}

/**
 * 今日の予定・実際の進行スロットを構築する。
 * - 終日はマスに出さない（窓判定専用）
 * - 始業: progress は空
 * - 終業: progress は生成時刻までの予定
 */
export function buildScheduleSlots(
  events: CalendarEvent[],
  mode: ScheduleMode,
  generatedAt: Date = new Date()
): ScheduleSlots {
  const window = computeTimeWindow(events);
  const plan = new Map<number, string>();
  const progress = new Map<number, string>();

  const jstNow = new Date(
    generatedAt.getTime() + 9 * 60 * 60 * 1000
  );
  const nowMin = jstNow.getUTCHours() * 60 + jstNow.getUTCMinutes();
  const progressEnd = Math.min(nowMin, HARD_END_MIN, window.endMin);

  for (const event of events) {
    if (event.allDay) continue;
    if (!shouldIncludeScheduleEvent(event)) continue;

    const startMin = floorTo15(getJSTMinutesOfDay(event.start));
    if (!inWindow(startMin, window)) continue;
    if (startMin >= HARD_END_MIN) continue;

    addToSlot(plan, startMin, event.summary);

    if (mode === "evening" && startMin <= progressEnd) {
      addToSlot(progress, startMin, event.summary);
    }
  }

  return { plan, progress, window };
}

export function hourSlotKeys(hour: number): number[] {
  const base = hour * 60;
  return [0, 1, 2, 3].map((i) => base + i * 15);
}
