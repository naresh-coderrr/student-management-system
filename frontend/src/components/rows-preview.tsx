"use client";

import { useMemo } from "react";

export function RowsPreview({
  rows,
  emptyLabel = "No matching rows.",
}: {
  rows: Record<string, unknown>[] | undefined;
  emptyLabel?: string;
}) {
  const columns = useMemo(() => {
    if (!rows?.length) return [];
    return Object.keys(rows[0]);
  }, [rows]);

  if (!rows?.length) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-foreground/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/70 text-xs tracking-wide text-muted-foreground uppercase">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-3 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row, index) => (
            <tr key={index} className="border-t border-border">
              {columns.map((column) => (
                <td key={column} className="max-w-56 truncate px-3 py-2">
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 12 && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground">
          Showing 12 of {rows.length} rows.
        </p>
      )}
    </div>
  );
}

export function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
