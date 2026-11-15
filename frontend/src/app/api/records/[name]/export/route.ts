import { NextResponse } from "next/server";
import { supabaseAdmin, verifyAuthUser } from "@/lib/supabase-server";

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

export async function POST(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  const { name } = await params;
  const decodedName = decodeURIComponent(name);

  try {
    const dataSql = `SELECT * FROM ${quoteIdent(decodedName)};`;
    const { data: rowsData, error } = await supabaseAdmin.rpc("exec_sql_query", { query: dataSql });
    if (error) {
      return NextResponse.json({ detail: error.message }, { status: 500 });
    }

    const rows = Array.isArray(rowsData) ? rowsData : [];
    if (rows.length === 0) {
      return new Response("", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${decodedName}.csv"`,
        },
      });
    }

    const headers = Object.keys(rows[0]);
    const csvLines = [headers.join(",")];
    for (const row of rows) {
      const line = headers.map((h) => {
        const val = row[h];
        if (val === null || val === undefined) return "";
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      });
      csvLines.push(line.join(","));
    }

    return new Response(csvLines.join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${decodedName}.csv"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
