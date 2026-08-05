"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface TemplateModalProps {
  type: "morning" | "evening" | "weekly" | "overtime";
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const LABEL: Record<string, string> = {
  morning: "始業日報",
  evening: "終業日報",
  weekly: "週次チャット",
  overtime: "残業申請",
};

const PLACEHOLDERS: Record<string, string[]> = {
  morning: ["{{date}} — M月D日(曜日)"],
  evening: ["{{date}} — M月D日(曜日)"],
  weekly: [
    "{{date}} — 今週月曜の日付",
    "{{monday_date}} 〜 {{friday_date}} — 各曜日の日付",
    "{{monday_events}} 〜 {{friday_events}} — Googleカレンダーの予定",
    "{{week_range}} — 週の期間（例: 7/20(月)～7/24(金)。休日出勤があればそこまで）",
    "{{prev_action_change}} — 前週の行動変化",
    "{{prev_week_tasks}} — 前週のタスク目標",
  ],
  overtime: [
    "{{current_month_overtime}} — 今月のコピー済み残業合計（例: 56時間15分）",
    "{{today_overtime}} — 当日18時以降の残業合計（例: 5時間）",
    "{{overtime_tasks}} — 当日18時以降のタスク一覧（タスク名(分数)形式）",
  ],
};

export default function TemplateModal({
  type,
  open,
  onClose,
  onSaved,
}: TemplateModalProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/templates?type=${type}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.content) setContent(data.content);
      })
      .finally(() => setLoading(false));
  }, [open, type]);

  const handleSave = async () => {
    setSaving(true);
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, content }),
    });
    setSaving(false);
    onSaved();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between border-b border-gray-100 p-4">
          <h2 className="font-semibold text-gray-800">
            テンプレート編集 — {LABEL[type]}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto p-4 flex flex-col gap-3 flex-1">
          <div className="rounded-lg bg-blue-50 p-3 text-xs text-blue-700 space-y-1">
            <p className="font-medium">使えるプレースホルダー:</p>
            {PLACEHOLDERS[type].map((p) => (
              <p key={p} className="font-mono">
                {p}
              </p>
            ))}
          </div>
          {loading ? (
            <div className="text-center text-sm text-gray-400 py-8">読み込み中...</div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="min-h-[400px] w-full resize-y rounded-xl border border-gray-200 p-3 font-mono text-sm leading-relaxed text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200"
            />
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 p-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
