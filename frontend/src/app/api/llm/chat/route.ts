import { NextResponse } from "next/server";
import { supabaseAdmin, verifyAuthUser } from "@/lib/supabase-server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const WRITE_REGEX = /^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i;

const CANDIDATE_MODELS = [
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
  "gemini-3.8-flash",
];

async function callGemini(contents: unknown[]) {
  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return text;
      }
    } catch {
      // try next candidate model
    }
  }
  return null;
}

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
    const { message } = await req.json();

    // 1. Fetch current schema from Supabase
    const { data: tablesData } = await supabaseAdmin.rpc("get_user_tables");
    const tables = Array.isArray(tablesData) ? tablesData : [];
    const schemaDetails = await Promise.all(
      tables.map(async (tbl: { table_name?: string } | string) => {
        const name = typeof tbl === "string" ? tbl : tbl.table_name || "";
        const { data: cols } = await supabaseAdmin.rpc("get_table_columns", { target_table: name });
        return { table: name, columns: cols || [] };
      })
    );

    const tableNames = schemaDetails.map((s) => s.table);

    const schemaText = schemaDetails
      .map(
        (s) =>
          `Table: "${s.table}"\n` +
          (Array.isArray(s.columns)
            ? s.columns
                .map(
                  (c: { column_name?: string; data_type?: string; is_primary_key?: boolean }) =>
                    `  - "${c.column_name}" (${c.data_type})${c.is_primary_key ? " [PRIMARY KEY]" : ""}`
                )
                .join("\n")
            : "")
      )
      .join("\n\n");

    const systemPrompt = `You are the AI Database Assistant for the Student Management System.
CURRENT DATABASE SCHEMA:
${schemaText || "No user tables exist yet."}

CRITICAL RULES:
1. Always generate valid PostgreSQL SQL.
2. ALWAYS wrap all table and column names in double quotes exactly matching the casing in the schema above (for example: "BEEE_Students", "SEEE_Students").
3. For inspection/display requests (like "display me the table beee_students" or "show all students"), generate a clean "SELECT * FROM \\"exact_table_name\\";" query.
4. Output EXACTLY ONE single SQL statement in the "sql" field. Never chain multiple queries with semicolons.
5. You MUST return ONLY a JSON object matching this schema:
{
  "type": "info" | "sql_preview" | "confirm_action",
  "message": "Friendly explanation of what you are showing or what will be modified",
  "sql": "SELECT / INSERT / UPDATE / etc",
  "affected_table": "Exact_Table_Name"
}`;

    const promptMessages = [
      { role: "user", parts: [{ text: `${systemPrompt}\n\nUser request: ${message}` }] },
    ];

    const candidateText = await callGemini(promptMessages);

    let parsed: { type?: string; message?: string; sql?: string; affected_table?: string } = {};
    if (candidateText) {
      try {
        parsed = JSON.parse(candidateText);
      } catch {
        parsed = { type: "info", message: candidateText };
      }
    } else {
      // Direct rule-based fallback if all models experienced temporary traffic spike
      const matchedTable = tableNames.find((t) =>
        new RegExp(`\\b${t.replace(/_/g, "[_ ]?")}\\b`, "i").test(message)
      );
      if (matchedTable && /display|show|list|view|fetch|get/i.test(message)) {
        parsed = {
          type: "sql_preview",
          message: `Showing records from "${matchedTable}":`,
          sql: `SELECT * FROM "${matchedTable}";`,
          affected_table: matchedTable,
        };
      } else {
        parsed = {
          type: "info",
          message: "I could not reach the AI service right now. Please check your connection or try again in a moment.",
        };
      }
    }

    let generatedSql = (parsed.sql || "").trim();
    let previewOverride: string | null = null;

    if (generatedSql.includes(";")) {
      const parts = generatedSql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      const writePart = parts.find((p) => WRITE_REGEX.test(p));
      const readPart = parts.find((p) => /^\s*(SELECT|WITH)\b/i.test(p));
      if (writePart) {
        generatedSql = writePart + ";";
        if (readPart) previewOverride = readPart;
      } else if (readPart) {
        generatedSql = readPart + ";";
      } else if (parts.length > 0) {
        generatedSql = parts[0] + ";";
      }
    }

    // Fix casing on table names in generated SQL to match PostgreSQL schema exactly
    for (const realName of tableNames) {
      const pattern = new RegExp(`(?:"?${realName}"?)(?=[\\s;,]|$|\\))`, "gi");
      generatedSql = generatedSql.replace(pattern, `"${realName}"`);
    }

    // 1. Read-only query (SELECT) -> Fetch and return the data immediately!
    if (generatedSql && !WRITE_REGEX.test(generatedSql)) {
      const { data: queryResult, error: qErr } = await supabaseAdmin.rpc("exec_sql_query", {
        query: generatedSql,
      });
      const rows = Array.isArray(queryResult) ? queryResult : [];
      return NextResponse.json({
        type: "sql_preview",
        message:
          parsed.message ||
          (rows.length > 0
            ? `Found ${rows.length} record(s):`
            : "No records found in this table."),
        sql: generatedSql,
        preview_data: rows,
        error: qErr?.message,
      });
    }

    // 2. Data modification query (INSERT / UPDATE / DELETE / DDL) -> Requires confirmation!
    if (generatedSql && WRITE_REGEX.test(generatedSql)) {
      let previewRows: unknown[] = [];
      const previewSql = previewOverride || previewSelectSql(generatedSql);
      if (previewSql) {
        try {
          const { data: pData } = await supabaseAdmin.rpc("exec_sql_query", { query: previewSql });
          if (Array.isArray(pData)) previewRows = pData;
        } catch {}
      }

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
