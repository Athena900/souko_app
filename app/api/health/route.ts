import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ ok: true, service: "cslogi-warehouse", scope: "m1-m2" });
}
