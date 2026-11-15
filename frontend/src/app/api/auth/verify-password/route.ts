import { NextResponse } from "next/server";
import { supabasePublic, verifyAuthUser, normalizeEmail } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  try {
    const { email, password } = await req.json();
    const cleanEmail = normalizeEmail(email || "");
    if (cleanEmail !== auth.email) {
      return NextResponse.json(
        { detail: "Enter the password for the account you are signed in with." },
        { status: 403 }
      );
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data.session) {
      return NextResponse.json(
        { detail: "Password did not match. The change was not applied." },
        { status: 401 }
      );
    }

    return NextResponse.json({ ok: true, email: cleanEmail });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
