import { NextResponse } from "next/server";
import { verifyAuthUser } from "@/lib/supabase-server";

export async function GET(req: Request) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const metadata = auth.user.user_metadata || {};
  return NextResponse.json({
    id: auth.user.id,
    email: auth.user.email,
    full_name: metadata.full_name || auth.email.split("@")[0],
    created_at: auth.user.created_at,
  });
}
