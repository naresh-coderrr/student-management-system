import { NextResponse } from "next/server";
import { supabaseAdmin, verifyAuthUser } from "@/lib/supabase-server";

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    const { data: columns, error } = await supabaseAdmin.rpc("get_table_columns", { target_table: decodedName });
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }
    return NextResponse.json({ table_name: decodedName, columns: columns || [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    const body = await req.json();
    const { operation } = body;
    let sql = "";

    if (operation === "rename_table") {
      const newName = body.new_table_name;
      if (!newName) return NextResponse.json({ detail: "new_table_name required" }, { status: 400 });
      sql = `ALTER TABLE ${quoteIdent(decodedName)} RENAME TO ${quoteIdent(newName)};`;
    } else if (operation === "add_column") {
      const col = body.column;
      if (!col?.name || !col?.data_type) return NextResponse.json({ detail: "Column name and data_type required" }, { status: 400 });
      let colDef = `${quoteIdent(col.name)} ${col.data_type}`;
      if (!col.is_nullable) colDef += " NOT NULL";
      if (col.is_unique) colDef += " UNIQUE";
      if (col.default_value) colDef += ` DEFAULT ${col.default_value}`;
      sql = `ALTER TABLE ${quoteIdent(decodedName)} ADD COLUMN ${colDef};`;
    } else if (operation === "drop_column") {
      const colName = body.column_name;
      if (!colName) return NextResponse.json({ detail: "column_name required" }, { status: 400 });
      sql = `ALTER TABLE ${quoteIdent(decodedName)} DROP COLUMN ${quoteIdent(colName)};`;
    } else if (operation === "rename_column") {
      const { column_name, new_column_name } = body;
      if (!column_name || !new_column_name) return NextResponse.json({ detail: "Both column names required" }, { status: 400 });
      sql = `ALTER TABLE ${quoteIdent(decodedName)} RENAME COLUMN ${quoteIdent(column_name)} TO ${quoteIdent(new_column_name)};`;
    } else if (operation === "alter_column_type") {
      const { column_name, new_data_type } = body;
      if (!column_name || !new_data_type) return NextResponse.json({ detail: "column_name and new_data_type required" }, { status: 400 });
      sql = `ALTER TABLE ${quoteIdent(decodedName)} ALTER COLUMN ${quoteIdent(column_name)} TYPE ${new_data_type};`;
    } else {
      return NextResponse.json({ detail: `Unknown operation: ${operation}` }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("exec_sql", { query: sql });
    if (error || (data && data.success === false)) {
      const msg = error?.message || data?.error || "Alter table failed";
      return NextResponse.json({ detail: msg }, { status: 400 });
    }

    await supabaseAdmin.rpc("log_audit", {
      p_table_name: decodedName,
      p_action: "ALTER_TABLE",
      p_old_data: null,
      p_new_data: body,
      p_executed_by: auth.email,
      p_sql_query: sql,
      p_description: `Altered table ${decodedName} (${operation})`,
    });

    return NextResponse.json({ success: true, operation, table_name: body.new_table_name || decodedName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    const sql = `DROP TABLE ${quoteIdent(decodedName)};`;
    const { data, error } = await supabaseAdmin.rpc("exec_sql", { query: sql });
    if (error || (data && data.success === false)) {
      const msg = error?.message || data?.error || "Drop table failed";
      return NextResponse.json({ detail: msg }, { status: 400 });
    }

    await supabaseAdmin.rpc("log_audit", {
      p_table_name: decodedName,
      p_action: "DROP_TABLE",
      p_old_data: null,
      p_new_data: null,
      p_executed_by: auth.email,
      p_sql_query: sql,
      p_description: `Dropped table ${decodedName}`,
    });

    return NextResponse.json({ success: true, table_name: decodedName });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
