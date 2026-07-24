"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { LogOut, RefreshCw } from "lucide-react";
import ReportEditor from "@/components/ReportEditor";
import TemplateModal from "@/components/TemplateModal";
import PrevWeekPanel from "@/components/PrevWeekPanel";
import {
  buildEveningVars,
  buildMorningVars,
  buildWeeklyVars,
  getWeekStart,
  renderTemplate,
  toDateString,
} from "@/lib/template";
import { ReportType, WeeklyCalendar } from "@/types";

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

  const today = new Date();
  const todayStr = toDateString(today);
  const weekStart = getWeekStart(today);
  const weekStartStr = toDateString(weekStart);

  const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // タブ切替時に内容を自動生成
  useEffect(() => {
    if (status !== "authenticated") return;
    generateTab(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, status]);

  // 前週データを週次タブ用に読み込む
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
        // 今日保存済みのデータがあればそれを使う
        const reportDate = tab === "weekly" ? weekStartStr : todayStr;
        const saved = await fetch(
          `/api/reports?type=${tab}&date=${reportDate}`
        ).then((r) => r.json());

        if (saved?.content) {
          setContents((prev) => ({ ...prev, [tab]: saved.content }));
          return;
        }

        // 新規生成
        const template = await fetch(`/api/templates?type=${tab}`).then((r) =>
          r.json()
        );
        if (!template?.content) return;

        let rendered = "";
        if (tab === "morning") {
          rendered = renderTemplate(template.content, buildMorningVars(today));
        } else if (tab === "evening") {
          rendered = renderTemplate(template.content, buildEveningVars(today));
        } else {
          // weekly: カレンダーを取得
          setCalendarLoading(true);
          let calendar: WeeklyCalendar = EMPTY_CALENDAR;
          try {
            const calRes = await fetch(
              `/api/calendar?week_start=${weekStartStr}`
            );
            if (calRes.ok) calendar = await calRes.json();
          } catch {
            // カレンダー取得失敗時は空で続行
          } finally {
            setCalendarLoading(false);
          }

          // 前週コンテンツを取得
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

    // デバウンスして自動保存
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
    // コピーと同時にDB保存
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

  if (!session) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">日報ツール</h1>
          <p className="text-sm text-gray-500">
            Googleアカウントでログインしてください
          </p>
        </div>
        <button
          onClick={() => signIn("google")}
          className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-6 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          Googleでログイン
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="border-b border-gray-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h1 className="font-semibold text-gray-900">日報ツール</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">{session.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {/* タブ */}
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

        {/* エディタエリア */}
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

      {/* テンプレートモーダル */}
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
