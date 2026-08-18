import { NextResponse } from "next/server";
import { getSupabasePublicEnv } from "@/src/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ブラウザで利用してよいSupabaseの接続情報だけを返す。Service Role Keyは扱わない。 */
export async function GET() {
  try {
    return NextResponse.json(getSupabasePublicEnv(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Supabaseの設定が必要です" }, { status: 503 });
  }
}
