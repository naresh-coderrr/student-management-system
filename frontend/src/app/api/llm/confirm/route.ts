import { NextResponse } from "next/server";
import { supabaseAdmin, supabasePublic, verifyAuthUser } from "@/lib/supabase-server";

export async function POST(req: Request) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  try {
    const { action_id, confirmed, password } = await req.json();

    if (!confirmed) {
      return NextResponse.json({ message: "Action was cancelled." });
    }

    if (!password) {
      return NextResponse.json(
        { detail: "Password is required to confirm this database change." },
        { status: 400 }
      );
    }

    // Verify user password with Supabase
    const { data: authData, error: authErr } = await supabasePublic.auth.signInWithPassword({
      email: auth.email,
      password,
    });

    if (authErr || !authData.session) {
      return NextResponse.json(
        { detail: "Password incorrect. The change was not applied." },
        { status: 401 }
      );
    }

    // Decode action
    let actionPayload: { sql: string; table: string; description: string };
    try {
      actionPayload = JSON.parse(Buffer.from(action_id, "base64").toString("utf-8"));
    } catch {
      return NextResponse.json({ detail: "Invalid or expired action token." }, { status: 400 });
    }

    const { sql, table, description } = actionPayload;

    // Execute the SQL
    const { data, error } = await supabaseAdmin.rpc("exec_sql", { query: sql });
    if (error || (data && data.success === false)) {
      const msg = error?.message || data?.error || "SQL execution failed";
      return NextResponse.json({ detail: msg }, { status: 400 });
    }

    // Log to audit
    await supabaseAdmin.rpc("log_audit", {
      p_table_name: table || "unknown",
      p_action: "LLM_ACTION",
      p_old_data: null,
      p_new_data: { sql, description },
      p_executed_by: auth.email,
      p_sql_query: sql,
      p_description: description || "Executed assistant change",
    });

    return NextResponse.json({
      message: "Change applied successfully to Supabase!",
      sql,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
