import { NextResponse } from "next/server";
import { resetTemplates } from "@/lib/db";

export async function POST() {
  try {
    await resetTemplates();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
