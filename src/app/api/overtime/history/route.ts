import { NextResponse } from "next/server";
import getDb from "@/lib/db";
import { parseOvertimeMinutes, parseTotalOvertimeFromContent } from "@/lib/template";

/**
 * GET /api/overtime/history
 * → 今月のコピー済み残業申請の履歴を返す（デバッグ用）
 */
export async function GET() {
  const sql = getDb();
  const rows = await sql`
    SELECT report_date, copied_at, content
    FROM reports
    WHERE type = 'overtime'
      AND copied_at IS NOT NULL
    ORDER BY copied_at DESC
    LIMIT 10
  `;

  const entries = rows.map((r) => {
    const raw = r.report_date;
    const date =
      raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
    return {
      date,
      copied_at: r.copied_at,
      daily_minutes: parseOvertimeMinutes(r.content),
      total_minutes: parseTotalOvertimeFromContent(r.content),
      content_preview: String(r.content).split("\n").slice(0, 12).join("\n"),
    };
  });

  return NextResponse.json({ entries });
}
