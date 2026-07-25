import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { parseOvertimeMinutes } from "@/lib/template";

/**
 * GET /api/overtime/monthly?month=2026-07
 * コピー済みの残業申請から今月の残業合計分数を返す
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // YYYY-MM

  if (!month) {
    return NextResponse.json({ error: "month required" }, { status: 400 });
  }

  const [year, mon] = month.split("-").map(Number);
  const firstDay = `${year}-${String(mon).padStart(2, "0")}-01`;
  const lastDay = new Date(year, mon, 0); // 月末
  const lastDayStr = `${year}-${String(mon).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const sql = getDb();
  const rows = await sql`
    SELECT content FROM reports
    WHERE type = 'overtime'
      AND copied_at IS NOT NULL
      AND report_date >= ${firstDay}
      AND report_date <= ${lastDayStr}
  `;

  const totalMinutes = rows.reduce((sum, row) => {
    return sum + parseOvertimeMinutes(row.content);
  }, 0);

  return NextResponse.json({ total_minutes: totalMinutes });
}
