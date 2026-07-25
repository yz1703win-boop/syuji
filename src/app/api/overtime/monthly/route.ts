import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

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
