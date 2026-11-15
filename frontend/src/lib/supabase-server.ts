import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || "";
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || "";

export const supabaseAdmin = createClient(supabaseUrl, supabaseSecretKey);
export const supabasePublic = createClient(supabaseUrl, supabasePublishableKey);

export const ALLOWED_EMAILS = new Set([
  "nareshramrajasimhan18@gmail.com",
  "nareshram4804@gmail.com",
  "nareshramstudies@gmail.com",
]);

export function normalizeEmail(email: string): string {
  return (email || "").trim().toLowerCase();
}

export function isAllowedEmail(email: string): boolean {
  return ALLOWED_EMAILS.has(normalizeEmail(email));
}

export async function verifyAuthUser(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return { error: "Authorization header required", status: 401 };
  }
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : authHeader;
  const { data: { user }, error } = await supabasePublic.auth.getUser(token);
  if (error || !user) {
    return { error: "Session expired. Sign in again.", status: 401 };
  }
  const email = normalizeEmail(user.email || "");
  if (!isAllowedEmail(email)) {
    return { error: "This account is not allowed.", status: 403 };
  }
  return { user, email };
}
