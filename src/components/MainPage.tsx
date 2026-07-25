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
  buildWeeklyVars,
  extractGoalUrls,
  getTodayJST,
  getWeekStart,
  renderTemplate,
  toDateString,
} from "@/lib/template";
import { WeeklyCalendar } from "@/types";

type Tab = "morning" | "evening" | "weekly";

const TAB_LABELS: Record<Tab, string> = {
  morning: "始業日報",
  evening: "終業日報",
  weekly: "週次チャット",
};

const EMPTY_CALENDAR: WeeklyCalendar = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
};

export default function MainPage() {
  const { data: session, status } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("morning");
  const [contents, setContents] = useState<Record<Tab, string>>({
    morning: "",
    evening: "",
    weekly: "",
  });
  const [isCopied, setIsCopied] = useState<Record<Tab, boolean>>({
    morning: false,
    evening: false,
    weekly: false,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [templateModalTab, setTemplateModalTab] = useState<Tab | null>(null);
  const [prevWeekContent, setPrevWeekContent] = useState<string | null>(null);
  const [loadingTab, setLoadingTab] = useState<Tab | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);

  // 毎回レンダリング時にJSTの今日を使う
  const today = getTodayJST();
  const todayStr = toDateString(today);
  const weekStart = getWeekStart(today);
  const weekStartStr = toDateString(weekStart);

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const generateTab = useCallback(
    async (tab: Tab) => {
      setLoadingTab(tab);
      try {
        const reportDate = tab === "weekly" ? weekStartStr : todayStr;
        const saved = await fetch(
          `/api/reports?type=${tab}&date=${reportDate}`
        ).then((r) => r.json());

        if (saved?.content) {
          setContents((prev) => ({ ...prev, [tab]: saved.content }));
          return;
        }

        const template = await fetch(`/api/templates?type=${tab}`).then((r) =>
          r.json()
        );
        if (!template?.content) return;

        let rendered = "";

        if (tab === "morning") {
          rendered = renderTemplate(
            template.content,
            buildMorningVars(today)
          );
        } else if (tab === "evening") {
          // 始業日報からURLを転記
          let goalUrl = "";
          const morningReport = await fetch(
            `/api/reports?type=morning&date=${todayStr}`
          ).then((r) => r.json());
          if (morningReport?.content) {
            goalUrl = extractGoalUrls(morningReport.content);
          }
          rendered = renderTemplate(
            template.content,
            buildEveningVars(today, goalUrl)
          );
        } else {
          // weekly: カレンダー取得（DBのrefresh tokenで自動認証）
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
        }

        setContents((prev) => ({ ...prev, [tab]: rendered }));
      } finally {
        setLoadingTab(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [todayStr, weekStartStr]
  );

  const handleChange = (tab: Tab, value: string) => {
    setContents((prev) => ({ ...prev, [tab]: value }));
    if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
    saveDebounceRef.current = setTimeout(async () => {
      setIsSaving(true);
      const reportDate = tab === "weekly" ? weekStartStr : todayStr;
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: tab,
          report_date: reportDate,
          week_start: tab === "weekly" ? weekStartStr : null,
          content: value,
        }),
      });
      setIsSaving(false);
    }, 1000);
  };

  const handleCopy = async (tab: Tab) => {
    await navigator.clipboard.writeText(contents[tab]);

    const reportDate = tab === "weekly" ? weekStartStr : todayStr;
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: tab,
        report_date: reportDate,
        week_start: tab === "weekly" ? weekStartStr : null,
        content: contents[tab],
      }),
    });
    await fetch("/api/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: tab, report_date: reportDate }),
    });

    // 始業日報をコピーしたら終業日報の「本日の目標」を自動更新
    if (tab === "morning") {
      const goalUrl = extractGoalUrls(contents.morning);
      if (goalUrl && !contents.evening) {
        // 終業日報がまだ生成されていない場合は次回タブオープン時に自動反映
        return;
      }
      if (goalUrl && contents.evening) {
        // すでに終業日報が表示中なら即時更新
        const template = await fetch("/api/templates?type=evening").then((r) =>
          r.json()
        );
        if (template?.content) {
          const updated = renderTemplate(
            template.content,
            buildEveningVars(today, goalUrl)
          );
          setContents((prev) => ({ ...prev, evening: updated }));
          // DBにも保存
          await fetch("/api/reports", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "evening",
              report_date: todayStr,
              week_start: null,
              content: updated,
            }),
          });
        }
      }
    }

    setIsCopied((prev) => ({ ...prev, [tab]: true }));
    setTimeout(() => setIsCopied((prev) => ({ ...prev, [tab]: false })), 3000);
  };

  const handleReset = (tab: Tab) => {
    setContents((prev) => ({ ...prev, [tab]: "" }));
    generateTab(tab);
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
          {(["morning", "evening", "weekly"] as Tab[]).map((tab) => (
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
              isSaving={isSaving}
              isCopied={isCopied[activeTab]}
            />
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
