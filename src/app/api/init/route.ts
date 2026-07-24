import { NextResponse } from "next/server";
import { initDb } from "@/lib/db";

export async function POST() {
  try {
    await initDb();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
