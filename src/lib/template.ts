import { CalendarEvent, WeeklyCalendar } from "@/types";

const WEEKDAYS = ["月", "火", "水", "木", "金", "土", "日"] as const;

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
  return date.toISOString().split("T")[0];
}

export function formatEventTime(isoString: string): string {
  const d = new Date(isoString);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

export function formatEventsForTemplate(events: CalendarEvent[]): string {
  if (events.length === 0) return "（予定なし）";
  return events
    .map((e) => {
      if (e.allDay) return `・${e.summary}`;
      return `・${formatEventTime(e.start)}〜${formatEventTime(e.end)} ${e.summary}`;
    })
    .join("\n");
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

export function buildMorningVars(today: Date): Record<string, string> {
  return { date: formatDate(today) };
}

export function buildEveningVars(today: Date): Record<string, string> {
  return { date: formatDate(today) };
}

export function buildWeeklyVars(
  weekStart: Date,
  calendar: WeeklyCalendar,
  prevWeekContent?: string
): Record<string, string> {
  const days = getWeekDays(weekStart);
  const weekEnd = days[4];

  const { prev_action_change, prev_week_tasks } =
    extractPrevWeekSections(prevWeekContent);

  const weekRange = `${weekStart.getMonth() + 1}/${weekStart.getDate()}(月)～${weekEnd.getMonth() + 1}/${weekEnd.getDate()}(金)`;

  return {
    header: "",
    greeting: "",
    prev_action_change,
    prev_week_tasks,
    diff: "特になし",
    action_change: "",
    monday_date: formatShortDate(days[0]),
    tuesday_date: formatShortDate(days[1]),
    wednesday_date: formatShortDate(days[2]),
    thursday_date: formatShortDate(days[3]),
    friday_date: formatShortDate(days[4]),
    monday_events: formatEventsForTemplate(calendar.monday),
    tuesday_events: formatEventsForTemplate(calendar.tuesday),
    wednesday_events: formatEventsForTemplate(calendar.wednesday),
    thursday_events: formatEventsForTemplate(calendar.thursday),
    friday_events: formatEventsForTemplate(calendar.friday),
    week_range: weekRange,
  };
}

function extractPrevWeekSections(content?: string): {
  prev_action_change: string;
  prev_week_tasks: string;
} {
  if (!content) {
    return {
      prev_action_change: "（前週データなし）",
      prev_week_tasks: "（前週データなし）",
    };
  }

  const actionChangeMatch = content.match(
    /３）行動変化[^\n]*\n+([\s\S]*?)(?=４）|$)/
  );
  const tasksMatch = content.match(/▼先週のタスク目標\n+([\s\S]*?)(?=２）|$)/);

  return {
    prev_action_change: actionChangeMatch?.[1]?.trim() ?? content.slice(0, 300),
    prev_week_tasks: tasksMatch?.[1]?.trim() ?? "（抽出できませんでした）",
  };
}
