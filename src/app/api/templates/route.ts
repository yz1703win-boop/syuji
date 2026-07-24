import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";
import { ReportType } from "@/types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") as ReportType;

  if (!type) {
    return NextResponse.json({ error: "type required" }, { status: 400 });
  }

  const sql = getDb();
  const rows = await sql`
    SELECT * FROM templates WHERE type = ${type} LIMIT 1
  `;
  return NextResponse.json(rows[0] ?? null);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { type, content } = body;

  const sql = getDb();
  const rows = await sql`
    INSERT INTO templates (type, content, updated_at)
    VALUES (${type}, ${content}, NOW())
    ON CONFLICT (type)
    DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
    RETURNING *
  `;
  return NextResponse.json(rows[0]);
}
