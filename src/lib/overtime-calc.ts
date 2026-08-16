/** 残業時間の算出（18時以降の重なり分） */

export const OVERTIME_START_MIN = 18 * 60;

/** UTC の ISO 文字列から JST の「その日の分」を返す */
export function getJSTMinutesOfDay(isoString: string): number {
  const d = new Date(isoString);
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.getUTCHours() * 60 + jst.getUTCMinutes();
}

/**
 * 18時以降に重なる分数を返す。
 * 例: 17:00–19:00 → 60（18:00–19:00）
 */
export function getOvertimeMinutes(startIso: string, endIso: string): number {
  const startMin = getJSTMinutesOfDay(startIso);
  let endMin = getJSTMinutesOfDay(endIso);
  if (endMin <= startMin) endMin += 24 * 60;

  const overtimeStart = Math.max(startMin, OVERTIME_START_MIN);
  const duration = endMin - overtimeStart;
  return duration > 0 ? Math.round(duration) : 0;
}
