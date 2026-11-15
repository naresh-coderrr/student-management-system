export type ColumnMeta = {
  column_name: string;
  data_type: string;
  udt_name?: string;
  is_nullable: string;
  column_default: string | null;
  is_primary_key: boolean;
  is_unique: boolean;
};

export type TableSummary = {
  table_name: string;
  columns: ColumnMeta[];
  row_count: number;
};

export type RecordPage = {
  data: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type AuditEntry = {
  id: number;
  table_name: string;
  action: string;
  old_data: unknown;
  new_data: unknown;
  executed_by: string;
  executed_at: string;
  sql_query: string | null;
  description: string | null;
};

export type ChatReply = {
  type: "info" | "sql_preview" | "confirm_action" | "error" | string;
  message: string;
  sql?: string;
  preview_data?: Record<string, unknown>[];
  action_id?: string;
  affects_all?: boolean;
};

export const DATA_TYPES = [
  "TEXT",
  "VARCHAR(255)",
  "INTEGER",
  "BIGINT",
  "SERIAL",
  "BIGSERIAL",
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
  "TIMESTAMPTZ",
  "NUMERIC",
  "REAL",
  "DOUBLE PRECISION",
  "JSON",
  "JSONB",
  "UUID",
] as const;

export type ColumnDraft = {
  id: string;
  name: string;
  data_type: string;
  is_primary_key: boolean;
  is_nullable: boolean;
  is_unique: boolean;
  default_value: string;
};

export function blankColumn(): ColumnDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    data_type: "TEXT",
    is_primary_key: false,
    is_nullable: true,
    is_unique: false,
    default_value: "",
  };
}
