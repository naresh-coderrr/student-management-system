import { NextResponse } from "next/server";
import { supabaseAdmin, verifyAuthUser } from "@/lib/supabase-server";

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

export async function GET(req: Request) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  try {
    let tables: string[] = [];

    // 1. Try get_user_tables RPC
    try {
      const { data: tablesData } = await supabaseAdmin.rpc("get_user_tables");
      if (Array.isArray(tablesData) && tablesData.length > 0) {
        tables = tablesData
          .map((t: { table_name?: string } | string) => (typeof t === "string" ? t : t.table_name || ""))
          .filter(Boolean);
      }
    } catch {}

    // 2. Direct catalog fallback if RPC returned empty
    if (tables.length === 0) {
      try {
        const { data: catData } = await supabaseAdmin.rpc("exec_sql_query", {
          query:
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name NOT IN ('schema_migrations', 'audit_log') ORDER BY table_name",
        });
        if (Array.isArray(catData)) {
          tables = catData
            .map((t: { table_name?: string }) => t.table_name || "")
            .filter(Boolean);
        }
      } catch {}
    }

    const results = await Promise.all(
      tables.map(async (name: string) => {
        let columns: unknown[] = [];
        let row_count = 0;

        try {
          const [colsRes, countRes] = await Promise.all([
            supabaseAdmin.rpc("get_table_columns", { target_table: name }),
            supabaseAdmin.rpc("get_table_row_count", { target_table: name }),
          ]);
          columns = Array.isArray(colsRes.data) ? colsRes.data : [];
          const countData = countRes.data as { count?: number } | null;
          row_count = typeof countData?.count === "number" ? countData.count : 0;
        } catch {}

        if (columns.length === 0) {
          try {
            const { data: cData } = await supabaseAdmin.rpc("exec_sql_query", {
              query: `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${name.replace(/'/g, "''")}' ORDER BY ordinal_position`,
            });
            if (Array.isArray(cData)) {
              columns = cData.map((c: { column_name?: string; data_type?: string; is_nullable?: string }) => ({
                column_name: c.column_name || "",
                data_type: c.data_type || "text",
                is_nullable: c.is_nullable || "YES",
                is_primary_key: false,
                is_unique: false,
              }));
            }
          } catch {}
        }

        return {
          table_name: name,
          columns,
          row_count,
        };
      })
    );

    return NextResponse.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  try {
    const body = await req.json();
    const { table_name, columns } = body;
    if (!table_name || !Array.isArray(columns) || columns.length === 0) {
      return NextResponse.json({ detail: "Table name and at least one column required" }, { status: 400 });
    }

    const colDefs: string[] = [];
    for (const col of columns) {
      let def = `${quoteIdent(col.name)} ${col.data_type}`;
      if (col.is_primary_key) def += " PRIMARY KEY";
      if (!col.is_nullable && !col.is_primary_key) def += " NOT NULL";
      if (col.is_unique && !col.is_primary_key) def += " UNIQUE";
      if (col.default_value) def += ` DEFAULT ${col.default_value}`;
      colDefs.push(def);
    }

    const sql = `CREATE TABLE ${quoteIdent(table_name)} (${colDefs.join(", ")});`;
    const { data, error } = await supabaseAdmin.rpc("exec_sql", { query: sql });
    if (error || (data && data.success === false)) {
      const msg = error?.message || data?.error || "Could not create table";
      return NextResponse.json({ detail: msg }, { status: 400 });
    }

    await supabaseAdmin.rpc("log_audit", {
      p_table_name: table_name,
      p_action: "CREATE_TABLE",
      p_old_data: null,
      p_new_data: { columns },
      p_executed_by: auth.email,
      p_sql_query: sql,
      p_description: `Created table ${table_name}`,
    });

    return NextResponse.json({ success: true, table_name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
