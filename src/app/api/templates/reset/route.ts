import { NextResponse } from "next/server";
import { resetTemplates } from "@/lib/db";

async function handler() {
  try {
    await resetTemplates();
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export const GET = handler;
export const POST = handler;
