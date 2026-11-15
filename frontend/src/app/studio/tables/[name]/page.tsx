"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCell, RowsPreview } from "@/components/rows-preview";
import { api, downloadCsv } from "@/lib/api";
import { notifySchemaChanged } from "@/lib/events";
import { useSession } from "@/components/session-provider";
import type { ColumnMeta, RecordPage } from "@/lib/types";

type View = { name: string; search: string };

export default function TableRecordsPage() {
  const params = useParams<{ name: string }>();
  const router = useRouter();
  const tableName = decodeURIComponent(params.name);
  const { user } = useSession();
  const [columns, setColumns] = useState<ColumnMeta[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [records, setRecords] = useState<RecordPage | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [editDraft, setEditDraft] = useState<Record<string, string>>({});
  const [review, setReview] = useState<Record<string, unknown> | null>(null);
  const [removing, setRemoving] = useState<Record<string, unknown> | null>(null);
  const [views, setViews] = useState<View[]>([]);
  const [viewName, setViewName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [nextName, setNextName] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const primary = columns.find((column) => column.is_primary_key) || columns[0];
  const viewKey = `sms-views-${tableName}`;

  const loadSchema = useCallback(async () => {
    const schema = await api<{ columns: ColumnMeta[] }>(`/api/tables/${encodeURIComponent(tableName)}`);
    setColumns(schema.columns);
  }, [tableName]);

  const loadRows = useCallback(async () => {
    const query = new URLSearchParams({
      page: String(page),
      page_size: "20",
      sort_order: sortOrder,
    });
    if (search.trim()) query.set("search", search.trim());
    if (sortBy) query.set("sort_by", sortBy);
    const result = await api<RecordPage>(`/api/records/${encodeURIComponent(tableName)}?${query}`);
    setRecords(result);
  }, [page, search, sortBy, sortOrder, tableName]);

  useEffect(() => {
    if (!user) return;
    loadSchema().catch((error: Error) => toast.error(error.message));
    const stored = localStorage.getItem(viewKey);
    if (stored) setViews(JSON.parse(stored) as View[]);
  }, [user, loadSchema, viewKey]);

  useEffect(() => {
    if (!user) return;
    loadRows().catch((error: Error) => toast.error(error.message));
  }, [user, loadRows]);

  const changes = useMemo(() => {
    if (!editing || !review) return [];
    return columns
      .filter((column) => String(editing[column.column_name] ?? "") !== (editDraft[column.column_name] ?? ""))
      .map((column) => ({
        column: column.column_name,
        before: editing[column.column_name],
        after: editDraft[column.column_name],
      }));
  }, [columns, editDraft, editing, review]);

  function openEdit(row: Record<string, unknown>) {
    const next: Record<string, string> = {};
    columns.forEach((column) => {
      const value = row[column.column_name];
      next[column.column_name] = value === null || value === undefined ? "" : String(value);
    });
    setEditing(row);
    setEditDraft(next);
  }

  async function insertRow() {
    const data: Record<string, unknown> = {};
    columns.forEach((column) => {
      const value = draft[column.column_name];
      if (value === undefined || value === "") return;
      data[column.column_name] = coerce(value, column.data_type);
    });
    try {
      await api(`/api/records/${encodeURIComponent(tableName)}`, {
        method: "POST",
        body: JSON.stringify({ data }),
      });
      setDraft({});
      toast.success("Record added.");
      await loadRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Insert failed");
    }
  }

  async function saveEdit() {
    if (!editing || !primary) return;
    const updates: Record<string, unknown> = {};
    changes.forEach((change) => {
      const column = columns.find((item) => item.column_name === change.column);
      updates[change.column] = change.after === "" ? null : coerce(String(change.after), column?.data_type || "TEXT");
    });
    if (!Object.keys(updates).length) {
      toast.error("Nothing changed.");
      return;
    }
    try {
      await api(`/api/records/${encodeURIComponent(tableName)}`, {
        method: "PUT",
        body: JSON.stringify({
          primary_key_column: primary.column_name,
          primary_key_value: editing[primary.column_name],
          updates,
        }),
      });
      toast.success("Record updated.");
      setReview(null);
      setEditing(null);
      await loadRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    }
  }

  async function deleteRow() {
    if (!removing || !primary) return;
    try {
      await api(`/api/records/${encodeURIComponent(tableName)}`, {
        method: "DELETE",
        body: JSON.stringify({
          primary_key_column: primary.column_name,
          primary_key_value: removing[primary.column_name],
        }),
      });
      toast.success("Record removed.");
      setRemoving(null);
      await loadRows();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed");
    }
  }

  function saveView() {
    if (!viewName.trim()) return;
    const next = [...views.filter((view) => view.name !== viewName.trim()), { name: viewName.trim(), search }];
    setViews(next);
    localStorage.setItem(viewKey, JSON.stringify(next));
    setViewName("");
  }

  async function renameTable() {
    const cleaned = nextName.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(cleaned)) {
      toast.error("Use letters, digits, and underscores. Start with a letter.");
      return;
    }
    setRenameBusy(true);
    try {
      await api(`/api/tables/${encodeURIComponent(tableName)}`, {
        method: "PUT",
        body: JSON.stringify({ operation: "rename_table", new_table_name: cleaned }),
      });
      notifySchemaChanged();
      toast.success(`Table is now ${cleaned}.`);
      setRenaming(false);
      router.replace(`/studio/tables/${encodeURIComponent(cleaned)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename the table");
    } finally {
      setRenameBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/studio/tables" className="text-sm text-primary">
            All tables
          </Link>
          <h1 className="font-display text-4xl">{tableName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {records?.total ?? 0} records
            {primary ? ` · key ${primary.column_name}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setNextName(tableName);
              setRenaming(true);
            }}
          >
            Rename table
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadCsv(tableName).catch((error: Error) => toast.error(error.message))}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {columns.map((column) => (
          <span key={column.column_name} className="rounded-full bg-card px-3 py-1 text-xs ring-1 ring-foreground/10">
            {column.column_name}
            <span className="text-muted-foreground"> {column.data_type}</span>
            {column.is_primary_key ? " · key" : ""}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Search text columns"
          className="h-10 max-w-sm"
        />
        <Input
          value={viewName}
          onChange={(event) => setViewName(event.target.value)}
          placeholder="Name this search"
          className="h-10 max-w-48"
        />
        <Button variant="outline" onClick={saveView}>
          Save view
        </Button>
        {views.map((view) => (
          <button
            key={view.name}
            type="button"
            className="rounded-full bg-accent px-3 py-1 text-xs"
            onClick={() => {
              setSearch(view.search);
              setPage(1);
            }}
          >
            {view.name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl bg-card ring-1 ring-foreground/10">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              {columns.map((column) => (
                <th key={column.column_name} className="px-3 py-3 font-medium">
                  <button
                    type="button"
                    onClick={() => {
                      if (sortBy === column.column_name) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                      else {
                        setSortBy(column.column_name);
                        setSortOrder("asc");
                      }
                    }}
                  >
                    {column.column_name}
                    {sortBy === column.column_name ? (sortOrder === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border bg-muted/40">
              {columns.map((column) => (
                <td key={column.column_name} className="px-2 py-2">
                  <Input
                    value={draft[column.column_name] || ""}
                    placeholder={column.column_name}
                    onChange={(event) => setDraft((current) => ({ ...current, [column.column_name]: event.target.value }))}
                  />
                </td>
              ))}
              <td className="px-2 py-2">
                <Button size="sm" onClick={insertRow}>
                  Add
                </Button>
              </td>
            </tr>
            {(records?.data || []).map((row, index) => (
              <tr key={index} className="border-t border-border">
                {columns.map((column) => (
                  <td key={column.column_name} className="max-w-56 truncate px-3 py-2">
                    {formatCell(row[column.column_name])}
                  </td>
                ))}
                <td className="px-2 py-2 whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setRemoving(row)}>
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Page {records?.page || 1} of {records?.total_pages || 1}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={!records || page >= records.total_pages}
            onClick={() => setPage((value) => value + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      <Dialog open={renaming} onOpenChange={setRenaming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change table name</DialogTitle>
            <DialogDescription>The rows stay. Only the table name changes.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="next-table-name">New name</Label>
            <Input
              id="next-table-name"
              value={nextName}
              onChange={(event) => setNextName(event.target.value)}
              className="h-10"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenaming(false)}>
              Cancel
            </Button>
            <Button onClick={renameTable} disabled={renameBusy || nextName.trim() === tableName}>
              {renameBusy ? "Saving…" : "Save name"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit record</DialogTitle>
            <DialogDescription>Review the current values, then confirm the difference before saving.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 space-y-3 overflow-auto">
            {columns.map((column) => (
              <div key={column.column_name} className="space-y-1">
                <Label>{column.column_name}</Label>
                <Input
                  value={editDraft[column.column_name] || ""}
                  disabled={column.is_primary_key}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, [column.column_name]: event.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => setReview(editing)}>Review changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Before and after</DialogTitle>
            <DialogDescription>These are the only fields that will change.</DialogDescription>
          </DialogHeader>
          {changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No fields differ from the saved row.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {changes.map((change) => (
                <div key={change.column} className="rounded-lg bg-muted px-3 py-2">
                  <p className="font-medium">{change.column}</p>
                  <p>Was: {formatCell(change.before)}</p>
                  <p>Will be: {formatCell(change.after)}</p>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReview(null)}>
              Back
            </Button>
            <Button onClick={saveEdit} disabled={!changes.length}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Delete this record?</DialogTitle>
            <DialogDescription>This is the row that will be removed.</DialogDescription>
          </DialogHeader>
          {removing && <RowsPreview rows={[removing]} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={deleteRow}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function coerce(value: string, dataType: string) {
  const type = dataType.toUpperCase();
  if (["INTEGER", "BIGINT", "SMALLINT", "SERIAL", "BIGSERIAL"].includes(type)) return Number(value);
  if (["NUMERIC", "REAL", "DOUBLE PRECISION"].some((item) => type.includes(item))) return Number(value);
  if (type === "BOOLEAN") return value === "true" || value === "1";
  return value;
}
