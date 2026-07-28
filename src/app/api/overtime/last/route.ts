import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { parseOvertimeMinutes } from "@/lib/template";

const SETTINGS_KEY = "overtime_last_applied";

// 初期値: 7月24日(金) 1時間
const DEFAULT_VALUE = JSON.stringify({ date: "2026-07-24", minutes: 60 });

/**
 * GET /api/overtime/last
 * → reports テーブルの直近コピーから「・残業時間⇒」を正確に読み取って返す
 *   （settings の古いキャッシュより reports の実データを優先）
 */
export async function GET() {
  const sql = getDb();

  // reports テーブルの最新コピーを参照（正確な「下の残業時間」を取得）
  const reportRows = await sql`
    SELECT content, report_date
    FROM reports
    WHERE type = 'overtime'
      AND copied_at IS NOT NULL
    ORDER BY copied_at DESC
    LIMIT 1
  `;

  if (reportRows[0]) {
    const minutes = parseOvertimeMinutes(reportRows[0].content);
    const date = String(reportRows[0].report_date).slice(0, 10);
    // settings も最新値で上書きしておく
    const value = JSON.stringify({ date, minutes });
    await sql`
      INSERT INTO settings (key, value, updated_at)
      VALUES (${SETTINGS_KEY}, ${value}, NOW())
      ON CONFLICT (key) DO UPDATE
        SET value = ${value},
            updated_at = NOW()
    `;
    return NextResponse.json({ date, minutes });
  }

  // reports が空なら settings にフォールバック
  const settingsRows = await sql`
    SELECT value FROM settings WHERE key = ${SETTINGS_KEY}
  `;
  if (settingsRows[0]) {
    return NextResponse.json(JSON.parse(settingsRows[0].value));
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
