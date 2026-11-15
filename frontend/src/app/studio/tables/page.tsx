"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { SCHEMA_CHANGED, notifySchemaChanged } from "@/lib/events";
import { useSession } from "@/components/session-provider";
import { DATA_TYPES, blankColumn, type ColumnDraft, type TableSummary } from "@/lib/types";

export default function TablesPage() {
  const { user } = useSession();
  const [tables, setTables] = useState<TableSummary[]>([]);
  const [designing, setDesigning] = useState(false);
  const [tableName, setTableName] = useState("");
  const [columns, setColumns] = useState<ColumnDraft[]>([blankColumn()]);
  const [busy, setBusy] = useState(false);

  async function load() {
    const next = await api<TableSummary[]>("/api/tables/");
    setTables(next);
  }

  useEffect(() => {
    if (!user) return;
    function refresh() {
      load().catch((error: Error) => toast.error(error.message));
    }
    refresh();
    window.addEventListener(SCHEMA_CHANGED, refresh);
    return () => window.removeEventListener(SCHEMA_CHANGED, refresh);
  }, [user]);

  function updateColumn(id: string, patch: Partial<ColumnDraft>) {
    setColumns((current) =>
      current.map((column) => {
        if (column.id !== id) {
          return patch.is_primary_key ? { ...column, is_primary_key: false } : column;
        }
        const next = { ...column, ...patch };
        if (next.is_primary_key) next.is_nullable = false;
        return next;
      }),
    );
  }

  async function createTable() {
    const cleaned = columns
      .map((column) => ({
        name: column.name.trim(),
        data_type: column.data_type,
        is_primary_key: column.is_primary_key,
        is_nullable: column.is_primary_key ? false : column.is_nullable,
        is_unique: column.is_unique,
        default_value: column.default_value.trim() || null,
      }))
      .filter((column) => column.name);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tableName.trim())) {
      toast.error("Table names use letters, digits, and underscores, and start with a letter.");
      return;
    }
    if (!cleaned.length) {
      toast.error("Add at least one column.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/tables/", {
        method: "POST",
        body: JSON.stringify({ table_name: tableName.trim(), columns: cleaned }),
      });
      toast.success(`${tableName.trim()} is ready.`);
      notifySchemaChanged();
      setDesigning(false);
      setTableName("");
      setColumns([blankColumn()]);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the table");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl">Tables</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            The first table uses the columns you enter here. You can add more tables whenever the
            registry needs them.
          </p>
        </div>
        <Button className="h-10" onClick={() => setDesigning((value) => !value)}>
          {designing ? "Close designer" : "Design a table"}
        </Button>
      </div>

      {designing && (
        <Card>
          <CardHeader>
            <CardTitle>New table</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-w-sm space-y-2">
              <Label htmlFor="table-name">Table name</Label>
              <Input id="table-name" value={tableName} onChange={(event) => setTableName(event.target.value)} placeholder="students" className="h-10" />
            </div>
            <div className="space-y-3">
              {columns.map((column, index) => (
                <div key={column.id} className="grid gap-3 rounded-xl bg-muted/40 p-3 lg:grid-cols-[1.2fr_1fr_auto]">
                  <div className="space-y-2">
                    <Label>Column {index + 1}</Label>
                    <Input
                      value={column.name}
                      placeholder="student_number"
                      onChange={(event) => updateColumn(column.id, { name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Data type</Label>
                    <select
                      value={column.data_type}
                      onChange={(event) => updateColumn(column.id, { data_type: event.target.value })}
                      className="h-8 w-full rounded-lg border border-input bg-card px-2 text-sm"
                    >
                      {DATA_TYPES.map((type) => (
                        <option key={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap items-end gap-4 pb-1 text-sm">
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={column.is_primary_key}
                        onCheckedChange={(checked) => updateColumn(column.id, { is_primary_key: checked === true })}
                      />
                      Primary key
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={!column.is_nullable}
                        disabled={column.is_primary_key}
                        onCheckedChange={(checked) => updateColumn(column.id, { is_nullable: checked !== true })}
                      />
                      Required
                    </label>
                    <label className="flex items-center gap-2">
                      <Checkbox
                        checked={column.is_unique}
                        onCheckedChange={(checked) => updateColumn(column.id, { is_unique: checked === true })}
                      />
                      Unique
                    </label>
                    <Button variant="ghost" onClick={() => setColumns((current) => current.filter((item) => item.id !== column.id))}>
                      Remove
                    </Button>
                  </div>
                  <Input
                    className="lg:col-span-3"
                    placeholder="Optional default, written as SQL (for example 0 or 'pending')"
                    value={column.default_value}
                    onChange={(event) => updateColumn(column.id, { default_value: event.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setColumns((current) => [...current, blankColumn()])}>
                Add column
              </Button>
              <Button onClick={createTable} disabled={busy}>
                {busy ? "Creating…" : "Create table"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {tables.map((table) => (
          <Link
            key={table.table_name}
            href={`/studio/tables/${encodeURIComponent(table.table_name)}`}
            className="rounded-2xl bg-card px-5 py-5 shadow-sm ring-1 ring-foreground/10 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-2xl">{table.table_name}</h2>
              <span className="text-sm text-muted-foreground">{table.row_count} rows</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {table.columns.map((column) => `${column.column_name} ${column.is_primary_key ? "(key)" : ""}`).join(" · ") || "No columns reported"}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
