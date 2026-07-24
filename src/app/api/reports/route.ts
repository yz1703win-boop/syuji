import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { ReportType } from "@/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as ReportType;
  const date = searchParams.get("date");

  if (!type || !date) {
    return NextResponse.json({ error: "type and date required" }, { status: 400 });
  }

  const sql = getDb();
  const rows = await sql`
    SELECT * FROM reports
    WHERE type = ${type} AND report_date = ${date}
    LIMIT 1
  `;
  return NextResponse.json(rows[0] ?? null);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, report_date, week_start, content } = body;

  const sql = getDb();
  const rows = await sql`
    INSERT INTO reports (type, report_date, week_start, content, updated_at)
    VALUES (${type}, ${report_date}, ${week_start ?? null}, ${content}, NOW())
    ON CONFLICT (type, report_date)
    DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { type, report_date } = body;

  const sql = getDb();
  const rows = await sql`
    UPDATE reports
    SET copied_at = NOW(), updated_at = NOW()
    WHERE type = ${type} AND report_date = ${report_date}
    RETURNING *
  `;
  return NextResponse.json(rows[0] ?? null);
}
