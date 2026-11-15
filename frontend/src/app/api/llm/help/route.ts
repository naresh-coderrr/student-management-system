import { NextResponse } from "next/server";
import { verifyAuthUser } from "@/lib/supabase-server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const APP_GUIDE_CONTEXT = `
Student Management System Documentation & User Guide:

1. Dynamic Table Builder:
- Navigate to "Tables" in the navigation bar.
- Click "+ New Table".
- Enter a table name (must start with letter/underscore and contain alphanumeric characters).
- Add columns: specify column name, data type (TEXT, INTEGER, BIGINT, NUMERIC, BOOLEAN, DATE, TIMESTAMP, UUID, etc.).
- Mark Primary Key (PK), Not Null, or Unique constraints.
- Click "Create Table".

2. Managing Records:
- Click on any table name in the sidebar or tables list.
- To insert a row: click "+ Add row", fill in the form fields, and click Save.
- To edit a row: click the Edit icon on any row, change values, and submit. The old and new values are tracked in the Activity log.
- To delete a row: click the Trash icon.
- Search: Use the search box above the table grid to filter across text columns.
- Export CSV: Click the "Export CSV" button in the table header to download all rows.

3. Assistant / Chatbot:
- Click the floating round chat button in the bottom right corner.
- You can ask questions in natural language, for example:
  - "Show me all students with grade A"
  - "Change student name from John to Jonathan where roll number is 101"
  - "Create a new table called Courses with id, course_name, and credits"
- Safety Confirmation: For any data modification (UPDATE, DELETE, ALTER, INSERT), the assistant will first show the existing record and query preview, then ask you to confirm with your account password before executing the change in Supabase.

4. Activity & Audit Logs:
- Navigate to "Activity" in the top bar to review the full audit log of every insert, update, delete, table creation, and assistant action with timestamps and user details.
`;

export async function POST(req: Request) {
  const auth = await verifyAuthUser(req);
  if ("error" in auth) {
    return NextResponse.json({ detail: auth.error }, { status: auth.status });
  }

  try {
    const { question } = await req.json();

    const systemPrompt = `You are a friendly, helpful guide for the Student Management System.
Answer the user's question clearly and concisely based on this system documentation:
${APP_GUIDE_CONTEXT}

User question: ${question || "How do I use this system?"}`;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
          generationConfig: {
            temperature: 0.3,
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    const answer = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text || "Here is information on using the system.";

    return NextResponse.json({ answer });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ detail: message }, { status: 500 });
  }
}
