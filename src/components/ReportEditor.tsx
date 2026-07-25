"use client";

import { useEffect, useRef } from "react";
import { Check, Copy, ImagePlus, RotateCcw, Settings } from "lucide-react";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  onCopy: () => Promise<void>;
  onReset?: () => void;
  onOpenSettings?: () => void;
  onRegenerateSchedule?: () => void;
  isSaving?: boolean;
  isCopied?: boolean;
  isScheduleLoading?: boolean;
  scheduleError?: string | null;
  showScheduleButton?: boolean;
  placeholder?: string;
}

export default function ReportEditor({
  value,
  onChange,
  onCopy,
  onReset,
  onOpenSettings,
  onRegenerateSchedule,
  isSaving,
  isCopied,
  isScheduleLoading,
  scheduleError,
  showScheduleButton,
  placeholder,
}: EditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="flex flex-col gap-3">
      {scheduleError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          日程画像の生成に失敗しました: {scheduleError}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {isSaving && <span>保存中...</span>}
          {isScheduleLoading && <span>日程画像を生成中...</span>}
        </div>
        <div className="flex items-center gap-2">
          {showScheduleButton && onRegenerateSchedule && (
            <button
              onClick={onRegenerateSchedule}
              disabled={isScheduleLoading}
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              <ImagePlus size={12} />
              {isScheduleLoading ? "生成中..." : "日程URLを再生成"}
            </button>
          )}
          {onReset && (
            <button
              onClick={onReset}
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <RotateCcw size={12} />
              リセット
            </button>
          )}
          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-1 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <Settings size={12} />
              テンプレート編集
            </button>
          )}
          <button
            onClick={onCopy}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all ${
              isCopied
                ? "bg-green-500 text-white"
                : "bg-gray-900 text-white hover:bg-gray-700"
            }`}
          >
            {isCopied ? (
              <>
                <Check size={14} />
                コピー済み
              </>
            ) : (
              <>
                <Copy size={14} />
                コピー
              </>
            )}
          </button>
        </div>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full min-h-[400px] resize-none rounded-xl border border-gray-200 bg-white p-4 font-mono text-sm leading-relaxed text-gray-800 outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-200 transition-all"
        style={{ height: "auto" }}
      />
    </div>
  );
}
