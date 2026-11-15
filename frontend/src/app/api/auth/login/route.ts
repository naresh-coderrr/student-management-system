import { NextResponse } from "next/server";
import { supabasePublic, isAllowedEmail, normalizeEmail } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    const cleanEmail = normalizeEmail(email || "");
    if (!isAllowedEmail(cleanEmail)) {
      return NextResponse.json(
        { detail: "This email is not one of the three accounts allowed to use Student Management System." },
        { status: 403 }
      );
    }
    if (!password || password.length < 6) {
      return NextResponse.json(
        { detail: "Enter the password for this account." },
        { status: 400 }
      );
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error || !data.session || !data.user) {
      return NextResponse.json(
        { detail: "Password was not accepted. If this is the first time for this email, set a password instead of signing in." },
        { status: 401 }
      );
    }

    const metadata = data.user.user_metadata || {};
    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: metadata.full_name || cleanEmail.split("@")[0],
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
