import { NextResponse } from "next/server";
import { supabaseAdmin, verifyAuthUser } from "@/lib/supabase-server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const WRITE_REGEX = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i;

function previewSelectSql(sql: string): string | null {
  const clean = sql.trim().replace(/;$/, "");
  const updateMatch = clean.match(/UPDATE\s+(.+?)\s+SET\s+.+?\s+WHERE\s+(.+)$/i);
  if (updateMatch) return `SELECT * FROM ${updateMatch[1]} WHERE ${updateMatch[2]}`;

  const deleteMatch = clean.match(/DELETE\s+FROM\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (deleteMatch) return `SELECT * FROM ${deleteMatch[1]} WHERE ${deleteMatch[2]}`;

  return null;
}

export async function POST(req: Request) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  try {
    const { message, conversation_history } = await req.json();

    // 1. Fetch current schema
    const { data: tablesData } = await supabaseAdmin.rpc("get_user_tables");
    const tables = Array.isArray(tablesData) ? tablesData : [];
    const schemaDetails = await Promise.all(
      tables.map(async (tbl: { table_name?: string } | string) => {
        const name = typeof tbl === "string" ? tbl : tbl.table_name || "";
        const { data: cols } = await supabaseAdmin.rpc("get_table_columns", { target_table: name });
        return { table: name, columns: cols || [] };
      })
    );

    const schemaText = schemaDetails
      .map(
        (s) =>
          `Table: ${s.table}\n` +
          (Array.isArray(s.columns)
            ? s.columns.map((c: { column_name?: string; data_type?: string; is_primary_key?: boolean }) => `  - ${c.column_name} (${c.data_type})${c.is_primary_key ? " [PK]" : ""}`).join("\n")
            : "")
      )
      .join("\n\n");

    const systemPrompt = `You are an intelligent database assistant for a Student Management System.
CURRENT DATABASE SCHEMA:
${schemaText || "No user tables exist yet."}

RULES:
1. Always generate valid PostgreSQL SQL for user requests.
2. If the user asks to query or inspect data, generate a SELECT query.
3. If the user asks to modify (INSERT, UPDATE, DELETE, CREATE TABLE, ALTER TABLE, DROP TABLE), generate the exact SQL.
4. You MUST respond with ONLY a valid JSON object matching this schema:
{
  "type": "info" | "sql_preview" | "confirm_action",
  "message": "Clear explanation in English of what you did or what will happen",
  "sql": "SELECT / INSERT / UPDATE / etc (optional if pure question)",
  "affected_table": "table_name_if_applicable"
}`;

    const promptMessages = [
      { role: "user", parts: [{ text: `${systemPrompt}\n\nUser request: ${message}` }] },
    ];

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: promptMessages,
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const candidateText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    let parsed: { type?: string; message?: string; sql?: string; affected_table?: string } = {};
    try {
      parsed = JSON.parse(candidateText);
    } catch {
      parsed = { type: "info", message: candidateText || "I could not process your request." };
    }

    const generatedSql = (parsed.sql || "").trim();

    // If it's a read-only query (SELECT)
    if (generatedSql && !WRITE_REGEX.test(generatedSql)) {
      const { data: queryResult, error: qErr } = await supabaseAdmin.rpc("exec_sql_query", { query: generatedSql });
      return NextResponse.json({
        type: "sql_preview",
        message: parsed.message || "Here are the query results:",
        sql: generatedSql,
        rows: queryResult || [],
        error: qErr?.message,
      });
    }

    // If it's a write query (INSERT / UPDATE / DELETE / DDL) -> Requires confirmation!
    if (generatedSql && WRITE_REGEX.test(generatedSql)) {
      let previewRows: unknown[] = [];
      const previewSql = previewSelectSql(generatedSql);
      if (previewSql) {
        try {
          const { data: pData } = await supabaseAdmin.rpc("exec_sql_query", { query: previewSql });
          if (Array.isArray(pData)) previewRows = pData;
        } catch {}
      }

      // Encode the pending action securely
      const actionPayload = {
        sql: generatedSql,
        table: parsed.affected_table || "database",
        description: parsed.message || "Database modification",
        time: Date.now(),
      };
      const actionId = Buffer.from(JSON.stringify(actionPayload)).toString("base64");

      return NextResponse.json({
        type: "confirm_action",
        message:
          parsed.message ||
          "Please review the proposed change and current record below, then confirm with your password to apply.",
        sql: generatedSql,
        preview_data: previewRows,
        action_id: actionId,
      });
    }

    return NextResponse.json({
      type: "info",
      message: parsed.message || "How can I assist you with the student records?",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
