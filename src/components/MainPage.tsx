"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { Calendar, RefreshCw } from "lucide-react";
import ReportEditor from "@/components/ReportEditor";
import TemplateModal from "@/components/TemplateModal";
import PrevWeekPanel from "@/components/PrevWeekPanel";
import {
  buildEveningVars,
  buildMorningVars,
  buildOvertimeVars,
  buildWeeklyVars,
  extractGoalUrls,
  getTodayJST,
  getWeekStart,
  OvertimeEvent,
  parseOvertimeMinutes,
  parseOvertimeSeedInput,
  renderTemplate,
  toDateString,
  upsertEveningResultUrl,
  upsertMorningScheduleUrl,
} from "@/lib/template";
import { WeeklyCalendar } from "@/types";

type Tab = "morning" | "evening" | "weekly" | "overtime";

const TAB_LABELS: Record<Tab, string> = {
  morning: "始業日報",
  evening: "終業日報",
  weekly: "週次チャット",
  overtime: "残業申請",
};

const EMPTY_CALENDAR: WeeklyCalendar = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  holidays: {
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
  },
};

async function fetchScheduleUrl(type: "morning" | "evening", date: string) {
  const res = await fetch("/api/schedule/gyazo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, date }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "日程画像の生成に失敗しました");
  }
  return data.url as string;
}

export default function MainPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("morning");
  const [contents, setContents] = useState<Record<Tab, string>>({
    morning: "",
    evening: "",
    weekly: "",
    overtime: "",
  });
  const [isCopied, setIsCopied] = useState<Record<Tab, boolean>>({
    morning: false,
    evening: false,
    weekly: false,
    overtime: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [templateModalTab, setTemplateModalTab] = useState<Tab | null>(null);
  const [prevWeekContent, setPrevWeekContent] = useState<string | null>(null);
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [overtimeMonthlyMinutes, setOvertimeMonthlyMinutes] = useState(0);
  const [overtimeSeedInput, setOvertimeSeedInput] = useState("");
  const [overtimeSeedSaving, setOvertimeSeedSaving] = useState(false);

  const today = getTodayJST();
  const todayStr = toDateString(today);
  const weekStart = getWeekStart(today);
  const weekStartStr = toDateString(weekStart);

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveReport = useCallback(
    async (tab: Tab, content: string) => {
      const reportDate = tab === "weekly" ? weekStartStr : todayStr;
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab,
          report_date: reportDate,
          week_start: tab === "weekly" ? weekStartStr : null,
          content,
        }),
      });
    },
    [todayStr, weekStartStr]
  );

  useEffect(() => {
    if (status === "loading") return;
    generateTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, status]);

  useEffect(() => {
    if (activeTab !== "weekly") return;
    fetch(`/api/reports/prev-week?week_start=${weekStartStr}`)
      .then((r) => r.json())
      .then((data) => setPrevWeekContent(data?.content ?? null))
      .catch(() => setPrevWeekContent(null));
  }, [activeTab, weekStartStr]);

  const applyScheduleUrl = useCallback(
    async (tab: "morning" | "evening", baseContent: string) => {
      setScheduleLoading(true);
      setScheduleError(null);
      try {
        const url = await fetchScheduleUrl(tab, todayStr);
        const updated =
          tab === "morning"
            ? upsertMorningScheduleUrl(baseContent, url)
            : upsertEveningResultUrl(baseContent, url);
        setContents((prev) => ({ ...prev, [tab]: updated }));
        await saveReport(tab, updated);
        return updated;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setScheduleError(msg);
        setContents((prev) => ({ ...prev, [tab]: baseContent }));
        await saveReport(tab, baseContent);
        return baseContent;
      } finally {
        setScheduleLoading(false);
      }
    },
    [saveReport, todayStr]
  );

  const generateTab = useCallback(
    async (tab: Tab) => {
      setLoadingTab(tab);
      setScheduleError(null);
      try {
        const reportDate = tab === "weekly" ? weekStartStr : todayStr;

        // overtime タブはカレンダーから毎回最新データを生成（保存済みは使わない）
        if (tab !== "overtime") {
          const saved = await fetch(
            `/api/reports?type=${tab}&date=${reportDate}`
          ).then((r) => r.json());

          if (saved?.content) {
            setContents((prev) => ({ ...prev, [tab]: saved.content }));
            return;
          }
        }

        const template = await fetch(`/api/templates?type=${tab}`).then((r) =>
          r.json()
        );
        if (!template?.content) return;

        let rendered = "";

        if (tab === "morning") {
          rendered = renderTemplate(
            template.content,
            buildMorningVars(today, "")
          );
          setContents((prev) => ({ ...prev, morning: rendered }));
          setLoadingTab(null);
          await applyScheduleUrl("morning", rendered);
          return;
        }

        if (tab === "evening") {
          let goalUrl = "";
          const morningReport = await fetch(
            `/api/reports?type=morning&date=${todayStr}`
          ).then((r) => r.json());
          if (morningReport?.content) {
            goalUrl = extractGoalUrls(morningReport.content);
          }
          rendered = renderTemplate(
            template.content,
            buildEveningVars(today, goalUrl, "")
          );
          setContents((prev) => ({ ...prev, evening: rendered }));
          setLoadingTab(null);
          await applyScheduleUrl("evening", rendered);
          return;
        }

        if (tab === "weekly") {
          setCalendarLoading(true);
          let calendar: WeeklyCalendar = EMPTY_CALENDAR;
          try {
            const calRes = await fetch(
              `/api/calendar?week_start=${weekStartStr}`
            );
            if (calRes.ok) calendar = await calRes.json();
          } catch {
            // 取得失敗時は空で続行
          } finally {
            setCalendarLoading(false);
          }

          const prevRes = await fetch(
            `/api/reports/prev-week?week_start=${weekStartStr}`
          ).then((r) => r.json());
          const prevContent = prevRes?.content ?? undefined;

          rendered = renderTemplate(
            template.content,
            buildWeeklyVars(weekStart, calendar, prevContent)
          );

          setContents((prev) => ({ ...prev, [tab]: rendered }));
        } else if (tab === "overtime") {
          // 当日18時以降のイベント取得と今月合計をカレンダーから取得
          setCalendarLoading(true);
          let overtimeEvents: OvertimeEvent[] = [];
          try {
            const calRes = await fetch(`/api/calendar/day?date=${todayStr}`);
            if (calRes.ok) {
              const data = await calRes.json();
              overtimeEvents = data.events ?? [];
            }
          } catch {
            // 取得失敗時は空で続行
          }

          // 今月の残業合計（カレンダーから集計）
          const monthStr = todayStr.slice(0, 7); // YYYY-MM
          let currentMonthMinutes = 0;
          try {
            const monthRes = await fetch(
              `/api/overtime/monthly?month=${monthStr}`
            );
            if (monthRes.ok) {
              const data = await monthRes.json();
              currentMonthMinutes = data.total_minutes ?? 0;
            }
          } catch {
            // 取得失敗時は0で続行
          } finally {
            setCalendarLoading(false);
          }

          rendered = renderTemplate(
            template.content,
            buildOvertimeVars(overtimeEvents, currentMonthMinutes)
          );

          setOvertimeMonthlyMinutes(currentMonthMinutes);
          setContents((prev) => ({ ...prev, [tab]: rendered }));
        }
      } finally {
        setLoadingTab(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayStr, weekStartStr, applyScheduleUrl]
  );

  const handleChange = (tab: Tab, value: string) => {
    setContents((prev) => ({ ...prev, [tab]: value }));
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(async () => {
      setIsSaving(true);
      await saveReport(tab, value);
      setIsSaving(false);
    }, 1000);
  };

  const handleCopy = async (tab: Tab) => {
    await navigator.clipboard.writeText(contents[tab]);

    const reportDate = tab === "weekly" ? weekStartStr : todayStr;
    await saveReport(tab, contents[tab]);
    await fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: tab, report_date: reportDate }),
    });

    // overtime タブ: コピー時に残業時間を月次合計に加算
    if (tab === "overtime") {
      const addMinutes = parseOvertimeMinutes(contents.overtime);
      if (addMinutes > 0) {
        const monthStr = todayStr.slice(0, 7);
        await fetch("/api/overtime/monthly", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ month: monthStr, add_minutes: addMinutes }),
        });
        setOvertimeMonthlyMinutes((prev) => prev + addMinutes);
      }
    }

    if (tab === "morning") {
      const goalUrl = extractGoalUrls(contents.morning);
      if (goalUrl && !contents.evening) {
        return;
      }
      if (goalUrl && contents.evening) {
        const template = await fetch("/api/templates?type=evening").then((r) =>
          r.json()
        );
        if (template?.content) {
          const resultMatch = contents.evening.match(
            /2　本日の結果\n[￣ー\-＝=]{8,}\n(https?:\/\/[^\s\n]+)?/
          );
          const resultUrl = resultMatch?.[1] ?? "";
          const updated = renderTemplate(
            template.content,
            buildEveningVars(today, goalUrl, resultUrl)
          );
          // 既存の結果URLを保持しつつ目標URLを更新
          const withResult = resultUrl
            ? upsertEveningResultUrl(updated, resultUrl)
            : updated;
          setContents((prev) => ({ ...prev, evening: withResult }));
          await saveReport("evening", withResult);
        }
      }
    }

    setIsCopied((prev) => ({ ...prev, [tab]: true }));
    setTimeout(() => setIsCopied((prev) => ({ ...prev, [tab]: false })), 3000);
  };

  const handleReset = async (tab: Tab) => {
    const reportDate = tab === "weekly" ? weekStartStr : todayStr;
    // 保存済みを消して再生成
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: tab,
        report_date: reportDate,
        week_start: tab === "weekly" ? weekStartStr : null,
        content: "",
      }),
    });
    setContents((prev) => ({ ...prev, [tab]: "" }));
    await generateTab(tab);
  };

  const handleRegenerateSchedule = async () => {
    if (activeTab !== "morning" && activeTab !== "evening") return;
    const base = contents[activeTab];
    if (!base) return;
    await applyScheduleUrl(activeTab, base);
  };

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400 text-sm">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h1 className="font-semibold text-gray-900">日報ツール</h1>
          <div className="flex items-center gap-3">
            {session ? (
              <>
                <span className="text-xs text-gray-400">
                  {session.user?.email}
                </span>
                <button
                  onClick={() => signOut()}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  連携解除
                </button>
              </>
            ) : (
              <button
                onClick={() => signIn("google")}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Calendar size={13} />
                Googleカレンダーと連携
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <div className="mb-6 flex gap-1 rounded-xl bg-gray-200/60 p-1">
          {(["morning", "evening", "weekly", "overtime"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-all ${
                activeTab === tab
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {activeTab === "weekly" && !session && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
            <p className="text-sm text-blue-700">
              Googleカレンダーと連携すると予定を自動取得できます
            </p>
            <button
              onClick={() => signIn("google")}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Calendar size={12} />
              連携する
            </button>
          </div>
        )}

        {loadingTab === activeTab ? (
          <div className="flex flex-col items-center gap-3 py-20 text-gray-400">
            <RefreshCw size={20} className="animate-spin" />
            <span className="text-sm">
              {calendarLoading
                ? "Googleカレンダーを取得中..."
                : scheduleLoading
                  ? "日程画像を生成中..."
                  : "テンプレートを生成中..."}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {activeTab === "weekly" && (
              <PrevWeekPanel content={prevWeekContent} />
            )}
            <ReportEditor
              value={contents[activeTab]}
              onChange={(v) => handleChange(activeTab, v)}
              onCopy={() => handleCopy(activeTab)}
              onReset={() => handleReset(activeTab)}
              onOpenSettings={() => setTemplateModalTab(activeTab)}
              onRegenerateSchedule={handleRegenerateSchedule}
              showScheduleButton={
                activeTab === "morning" || activeTab === "evening"
              }
              isSaving={isSaving}
              isCopied={isCopied[activeTab]}
              isScheduleLoading={scheduleLoading}
              scheduleError={
                activeTab === "morning" || activeTab === "evening"
                  ? scheduleError
                  : null
              }
            />
            {activeTab === "overtime" && (
              <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                <p className="mb-2 text-xs font-medium text-amber-800">
                  今月の残業累計を手動設定
                  <span className="ml-2 font-normal text-amber-600">
                    現在: {Math.floor(overtimeMonthlyMinutes / 60)}時間{overtimeMonthlyMinutes % 60 > 0 ? `${overtimeMonthlyMinutes % 60}分` : ""}
                  </span>
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={overtimeSeedInput}
                    onChange={(e) => setOvertimeSeedInput(e.target.value)}
                    placeholder="例: 46:55 または 46時間55分"
                    className="flex-1 rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-amber-400"
                  />
                  <button
                    disabled={overtimeSeedSaving}
                    onClick={async () => {
                      const mins = parseOvertimeSeedInput(overtimeSeedInput);
                      if (mins <= 0) return;
                      setOvertimeSeedSaving(true);
                      const monthStr = todayStr.slice(0, 7);
                      const res = await fetch("/api/overtime/monthly", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ month: monthStr, total_minutes: mins }),
                      });
                      if (res.ok) {
                        setOvertimeMonthlyMinutes(mins);
                        setOvertimeSeedInput("");
                        await generateTab("overtime");
                      }
                      setOvertimeSeedSaving(false);
                    }}
                    className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
                  >
                    {overtimeSeedSaving ? "設定中..." : "設定"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {templateModalTab && (
        <TemplateModal
          type={templateModalTab}
          open={true}
          onClose={() => setTemplateModalTab(null)}
          onSaved={() => generateTab(templateModalTab)}
        />
      )}
    </div>
  );
}
