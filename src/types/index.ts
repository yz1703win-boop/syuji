export type ReportType = "morning" | "evening" | "weekly";

export interface Template {
  id: number;
  type: ReportType;
  content: string;
  updated_at: string;
}

export interface Report {
  id: number;
  type: ReportType;
  report_date: string;
  week_start: string | null;
  content: string;
  copied_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  allDay: boolean;
}

export type DayKey = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";

export interface WeeklyCalendar {
  monday: CalendarEvent[];
  tuesday: CalendarEvent[];
  wednesday: CalendarEvent[];
  thursday: CalendarEvent[];
  friday: CalendarEvent[];
  /** true の曜日はその日を「休み」として扱う */
  holidays: Record<DayKey, boolean>;
}
