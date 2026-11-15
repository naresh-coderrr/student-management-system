import { NextResponse } from "next/server";
import { supabaseAdmin, verifyAuthUser } from "@/lib/supabase-server";

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

function quoteLiteral(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

export async function GET(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const { searchParams } = new URL(req.url);

  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const pageSize = Math.min(500, Math.max(1, parseInt(searchParams.get("page_size") || "25", 10)));
  const sortBy = searchParams.get("sort_by");
  const sortOrder = (searchParams.get("sort_order") || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  const search = searchParams.get("search");
  const filtersRaw = searchParams.get("filters");

  try {
    const tbl = quoteIdent(decodedName);
    const whereClauses: string[] = [];

    if (search) {
      const { data: cols } = await supabaseAdmin.rpc("get_table_columns", { target_table: decodedName });
      const textCols: string[] = Array.isArray(cols)
        ? cols
            .filter((c: { data_type?: string }) => /text|char/i.test(c.data_type || ""))
            .map((c: { column_name?: string }) => c.column_name)
            .filter((c): c is string => Boolean(c))
        : [];

      if (textCols.length > 0) {
        const escapedSearch = `'%${search.replace(/'/g, "''")}%'`;
        const orMatches = textCols.map((c: string) => `CAST(${quoteIdent(c)} AS TEXT) ILIKE ${escapedSearch}`);
        whereClauses.push(`(${orMatches.join(" OR ")})`);
      }
    }

    if (filtersRaw) {
      try {
        const filters = JSON.parse(filtersRaw);
        for (const [col, val] of Object.entries(filters)) {
          if (val !== undefined && val !== null && val !== "") {
            whereClauses.push(`${quoteIdent(col)} = ${quoteLiteral(val)}`);
          }
        }
      } catch {}
    }

    const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(" AND ")}` : "";
    const countSql = `SELECT COUNT(*) as count FROM ${tbl}${whereSql};`;
    const countRes = await supabaseAdmin.rpc("exec_sql_query", { query: countSql });
    const countRows = countRes.data as Array<{ count?: number }> | null;
    const total = countRows?.[0]?.count ? Number(countRows[0].count) : 0;

    let orderSql = "";
    if (sortBy) {
      orderSql = ` ORDER BY ${quoteIdent(sortBy)} ${sortOrder}`;
    }

    const offset = (page - 1) * pageSize;
    const dataSql = `SELECT * FROM ${tbl}${whereSql}${orderSql} LIMIT ${pageSize} OFFSET ${offset};`;
    const dataRes = await supabaseAdmin.rpc("exec_sql_query", { query: dataSql });
    const rows = Array.isArray(dataRes.data) ? dataRes.data : [];

    return NextResponse.json({
      data: rows,
      total,
      page,
      page_size: pageSize,
      total_pages: Math.ceil(total / pageSize) || 1,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    const body = await req.json();
    const data = body.data || body;
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return NextResponse.json({ detail: "No data provided" }, { status: 400 });
    }

    const colNames = keys.map(quoteIdent).join(", ");
    const colValues = keys.map((k) => quoteLiteral(data[k])).join(", ");
    const sql = `INSERT INTO ${quoteIdent(decodedName)} (${colNames}) VALUES (${colValues}) RETURNING *;`;

    const { data: resData, error } = await supabaseAdmin.rpc("exec_sql_query", { query: sql });
    if (error || (resData && (resData as { error?: string }).error)) {
      const msg = error?.message || (resData as { error?: string })?.error || "Insert failed";
      return NextResponse.json({ detail: msg }, { status: 400 });
    }

    const inserted = Array.isArray(resData) ? resData[0] : resData;

    await supabaseAdmin.rpc("log_audit", {
      p_table_name: decodedName,
      p_action: "INSERT",
      p_old_data: null,
      p_new_data: inserted,
      p_executed_by: auth.email,
      p_sql_query: sql,
      p_description: `Inserted row into ${decodedName}`,
    });

    return NextResponse.json({ success: true, data: inserted });
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
    const { primary_key_column, primary_key_value, updates } = await req.json();
    if (!primary_key_column || primary_key_value === undefined || !updates) {
      return NextResponse.json({ detail: "Missing primary key or updates" }, { status: 400 });
    }

    // Fetch old row
    const oldSql = `SELECT * FROM ${quoteIdent(decodedName)} WHERE ${quoteIdent(primary_key_column)} = ${quoteLiteral(primary_key_value)} LIMIT 1;`;
    const oldRes = await supabaseAdmin.rpc("exec_sql_query", { query: oldSql });
    const oldRows = Array.isArray(oldRes.data) ? oldRes.data : [];
    const oldData = oldRows[0] || null;

    const setClauses = Object.entries(updates).map(([k, v]) => `${quoteIdent(k)} = ${quoteLiteral(v)}`);
    const updateSql = `UPDATE ${quoteIdent(decodedName)} SET ${setClauses.join(", ")} WHERE ${quoteIdent(primary_key_column)} = ${quoteLiteral(primary_key_value)} RETURNING *;`;

    const { data: updateRes, error } = await supabaseAdmin.rpc("exec_sql_query", { query: updateSql });
    if (error || (updateRes && (updateRes as { error?: string }).error)) {
      const msg = error?.message || (updateRes as { error?: string })?.error || "Update failed";
      return NextResponse.json({ detail: msg }, { status: 400 });
    }

    const newData = Array.isArray(updateRes) ? updateRes[0] : updateRes;

    await supabaseAdmin.rpc("log_audit", {
      p_table_name: decodedName,
      p_action: "UPDATE",
      p_old_data: oldData,
      p_new_data: newData,
      p_executed_by: auth.email,
      p_sql_query: updateSql,
      p_description: `Updated row in ${decodedName}`,
    });

    return NextResponse.json({ success: true, old_data: oldData, new_data: newData });
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
    const { primary_key_column, primary_key_value } = await req.json();
    if (!primary_key_column || primary_key_value === undefined) {
      return NextResponse.json({ detail: "Missing primary key" }, { status: 400 });
    }

    const oldSql = `SELECT * FROM ${quoteIdent(decodedName)} WHERE ${quoteIdent(primary_key_column)} = ${quoteLiteral(primary_key_value)} LIMIT 1;`;
    const oldRes = await supabaseAdmin.rpc("exec_sql_query", { query: oldSql });
    const oldRows = Array.isArray(oldRes.data) ? oldRes.data : [];
    const oldData = oldRows[0] || null;

    const delSql = `DELETE FROM ${quoteIdent(decodedName)} WHERE ${quoteIdent(primary_key_column)} = ${quoteLiteral(primary_key_value)};`;
    const { data: delRes, error } = await supabaseAdmin.rpc("exec_sql", { query: delSql });
    if (error || (delRes && (delRes as { success?: boolean }).success === false)) {
      const msg = error?.message || (delRes as { error?: string })?.error || "Delete failed";
      return NextResponse.json({ detail: msg }, { status: 400 });
    }

    await supabaseAdmin.rpc("log_audit", {
      p_table_name: decodedName,
      p_action: "DELETE",
      p_old_data: oldData,
      p_new_data: null,
      p_executed_by: auth.email,
      p_sql_query: delSql,
      p_description: `Deleted row from ${decodedName}`,
    });

    return NextResponse.json({ success: true, deleted_data: oldData });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
