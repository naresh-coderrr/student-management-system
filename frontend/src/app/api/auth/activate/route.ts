import { NextResponse } from "next/server";
import { supabaseAdmin, supabasePublic, isAllowedEmail, normalizeEmail } from "@/lib/supabase-server";

export async function POST(req: Request) {
  try {
    const { email, password, full_name } = await req.json();
    const cleanEmail = normalizeEmail(email || "");
    if (!isAllowedEmail(cleanEmail)) {
      return NextResponse.json(
        { detail: "This email is not one of the three accounts allowed to use Student Management System." },
        { status: 403 }
      );
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { detail: "Choose a password of at least 8 characters." },
        { status: 400 }
      );
    }

    // Create user via admin API
    const displayName = full_name || cleanEmail.split("@")[0];
    const { error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: cleanEmail,
      password,
      email_confirm: true,
      user_metadata: { full_name: displayName },
    });

    if (createError) {
      const msg = createError.message.toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        return NextResponse.json(
          { detail: "This account already has a password. Sign in with it." },
          { status: 409 }
        );
      }
      return NextResponse.json({ detail: createError.message }, { status: 400 });
    }

    // Now sign in
    const { data, error: signInError } = await supabasePublic.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (signInError || !data.session || !data.user) {
      return NextResponse.json(
        { detail: "Account was created, but sign-in failed. Please sign in." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: displayName,
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
