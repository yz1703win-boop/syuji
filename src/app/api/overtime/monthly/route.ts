import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { parseTotalOvertimeFromContent } from "@/lib/template";

function settingsKey(month: string) {
  return `overtime_total_${month}`;
}

/**
 * GET /api/overtime/monthly?month=2026-07
 * → settings テーブルから今月の累計残業分数を返す
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month");
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });

  const sql = getDb();
  const rows = await sql`
    SELECT value FROM settings WHERE key = ${settingsKey(month)}
  `;
  const total = rows[0] ? parseInt(rows[0].value) : 0;
  return NextResponse.json({ total_minutes: total });
}

/**
 * POST /api/overtime/monthly
 * body: { month: "2026-07", add_minutes: 150 }
 * → 累計に加算
 */
export async function POST(req: NextRequest) {
  const { month, add_minutes } = await req.json();
  if (!month || add_minutes == null) {
    return NextResponse.json({ error: "month and add_minutes required" }, { status: 400 });
  }

  const sql = getDb();
  const key = settingsKey(month);
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${String(add_minutes)}, NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = (CAST(settings.value AS INTEGER) + ${add_minutes})::TEXT,
          updated_at = NOW()
  `;
  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  return NextResponse.json({ total_minutes: parseInt(rows[0].value) });
}

/**
 * PUT /api/overtime/monthly
 * body: { month: "2026-07", total_minutes: 2815 }
 * → 初期値として直接セット
 */
export async function PUT(req: NextRequest) {
  const { month, total_minutes } = await req.json();
  if (!month || total_minutes == null) {
    return NextResponse.json({ error: "month and total_minutes required" }, { status: 400 });
  }

  const sql = getDb();
  const key = settingsKey(month);
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${String(total_minutes)}, NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = ${String(total_minutes)},
          updated_at = NOW()
  `;
  return NextResponse.json({ ok: true, total_minutes });
}

/**
 * DELETE /api/overtime/monthly
 * body: { month: "2026-07", days: 2 }
 * → reports テーブルの直近N件の残業時間を累計から差し引く
 */
export async function DELETE(req: NextRequest) {
  const { month, days = 2 } = await req.json();
  if (!month) return NextResponse.json({ error: "month required" }, { status: 400 });

  const sql = getDb();

  // 直近N件のコピー済み残業申請を取得
  const firstDay = `${month}-01`;
  const recentRows = await sql`
    SELECT content, report_date, copied_at
    FROM reports
    WHERE type = 'overtime'
      AND copied_at IS NOT NULL
      AND report_date >= ${firstDay}
    ORDER BY copied_at DESC
    LIMIT ${days}
  `;

  if (recentRows.length === 0) {
    return NextResponse.json({ ok: true, removed_minutes: 0, total_minutes: 0, entries: [] });
  }

  // 差し引く分数を合計（コピー時の「今月の現残業時間⇒」の値を使用）
  const subtractMinutes = recentRows.reduce((sum, row) => {
    return sum + parseTotalOvertimeFromContent(row.content);
  }, 0);

  const key = settingsKey(month);
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${key}, ${String(Math.max(0, -subtractMinutes))}, NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = GREATEST(0, (CAST(settings.value AS INTEGER) - ${subtractMinutes}))::TEXT,
          updated_at = NOW()
  `;

  const rows = await sql`SELECT value FROM settings WHERE key = ${key}`;
  const newTotal = rows[0] ? parseInt(rows[0].value) : 0;

  const entries = recentRows.map((r) => ({
    date: r.report_date,
    total_minutes: parseTotalOvertimeFromContent(r.content),
  }));

  return NextResponse.json({ ok: true, removed_minutes: subtractMinutes, total_minutes: newTotal, entries });
}
