"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

interface PrevWeekPanelProps {
  content: string | null;
}

export default function PrevWeekPanel({ content }: PrevWeekPanelProps) {
  const [open, setOpen] = useState(false);

  if (!content) return null;

  return (
    <div className="rounded-xl border border-amber-100 bg-amber-50">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-3 text-sm font-medium text-amber-700"
      >
        <span>前週のチャットを参照する</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && (
        <div className="border-t border-amber-100 p-3">
          <pre className="whitespace-pre-wrap font-mono text-xs text-amber-800 leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
}
