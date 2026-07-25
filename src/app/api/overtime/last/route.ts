import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

const SETTINGS_KEY = "overtime_last_applied";

// 初期値: 7月24日(金) 1時間
const DEFAULT_VALUE = JSON.stringify({ date: "2026-07-24", minutes: 60 });

/**
 * GET /api/overtime/last
 * → 最後にコピーした残業申請の日付と分数を返す
 */
export async function GET() {
  const sql = getDb();
  const rows = await sql`
    SELECT value FROM settings WHERE key = ${SETTINGS_KEY}
  `;

  if (rows[0]) {
    return NextResponse.json(JSON.parse(rows[0].value));
  }

  // 初期値をDBに保存して返す
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${SETTINGS_KEY}, ${DEFAULT_VALUE}, NOW())
    ON CONFLICT (key) DO NOTHING
  `;
  return NextResponse.json(JSON.parse(DEFAULT_VALUE));
}

/**
 * PUT /api/overtime/last
 * body: { date: "2026-07-25", minutes: 120 }
 * → コピー時に呼ばれて最終申請を更新
 */
export async function PUT(req: NextRequest) {
  const { date, minutes } = await req.json();
  if (!date || minutes == null) {
    return NextResponse.json({ error: "date and minutes required" }, { status: 400 });
  }

  const sql = getDb();
  const value = JSON.stringify({ date, minutes });
  await sql`
    INSERT INTO settings (key, value, updated_at)
    VALUES (${SETTINGS_KEY}, ${value}, NOW())
    ON CONFLICT (key) DO UPDATE
      SET value = ${value},
          updated_at = NOW()
  `;
  return NextResponse.json({ ok: true });
}
