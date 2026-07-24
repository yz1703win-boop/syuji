import { NextRequest, NextResponse } from "next/server";
import getDb from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const week_start = searchParams.get("week_start");

  if (!week_start) {
    return NextResponse.json({ error: "week_start required" }, { status: 400 });
  }

  const d = new Date(week_start);
  d.setDate(d.getDate() - 7);
  const prevWeekStart = d.toISOString().split("T")[0];

  const sql = getDb();
  const rows = await sql`
    SELECT * FROM reports
    WHERE type = 'weekly' AND week_start = ${prevWeekStart}
    LIMIT 1
  `;
  return NextResponse.json(rows[0] ?? null);
}
