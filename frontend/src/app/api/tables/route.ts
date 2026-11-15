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
    const { data: tablesData, error: tablesErr } = await supabaseAdmin.rpc("get_user_tables");
    if (tablesErr) {
      return NextResponse.json({ detail: tablesErr.message }, { status: 500 });
    }

    const tables = Array.isArray(tablesData) ? tablesData : [];
    const results = await Promise.all(
      tables.map(async (tbl: { table_name?: string } | string) => {
        const name = typeof tbl === "string" ? tbl : tbl.table_name || "";
        const [colsRes, countRes] = await Promise.all([
          supabaseAdmin.rpc("get_table_columns", { target_table: name }),
          supabaseAdmin.rpc("get_table_row_count", { target_table: name }),
        ]);
        const columns = colsRes.data || [];
        const countData = countRes.data as { count?: number } | null;
        const row_count = countData?.count ?? 0;
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

    // Log to audit
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
