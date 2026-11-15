import { NextResponse } from "next/server";
import { supabaseAdmin, verifyAuthUser } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "40", 10)));

  try {
    const { data: rows, error } = await supabaseAdmin.rpc("get_audit_log", {
      p_limit: limit,
      p_offset: 0,
    });
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    return NextResponse.json(Array.isArray(rows) ? rows : []);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
