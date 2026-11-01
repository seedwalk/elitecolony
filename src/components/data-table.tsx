"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DataTable<T>({
  data,
  columns,
  initialSorting = [],
  initialHidden = {},
  pageSize = 50,
  placeholder = "Filter…",
  onRowClick,
  onRowDoubleClick,
  getRowId,
  selectedId,
  maxHeight,
  toolbar,
}: {
  data: T[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<T, any>[];
  initialSorting?: SortingState;
  initialHidden?: VisibilityState;
  pageSize?: number;
  placeholder?: string;
  onRowClick?: (row: T) => void;
  onRowDoubleClick?: (row: T) => void;
  getRowId?: (row: T) => string;
  selectedId?: string | null;
  /** When set, the table scrolls internally with a sticky header (e.g. "calc(100vh - 260px)"). */
  maxHeight?: string;
  toolbar?: ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>(initialSorting);
  const [globalFilter, setGlobalFilter] = useState("");
  const [visibility, setVisibility] = useState<VisibilityState>(initialHidden);
  const [showCols, setShowCols] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, columnVisibility: visibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setVisibility,
    getRowId: getRowId ? (r) => getRowId(r) : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    autoResetPageIndex: false,
    initialState: { pagination: { pageSize } },
  });

  // When something is selected elsewhere (e.g. on the map), jump to its page and scroll to it.
  useEffect(() => {
    if (!selectedId) return;
    const rows = table.getPrePaginationRowModel().rows; // filtered + sorted
    const idx = rows.findIndex((r) => r.id === selectedId);
    if (idx < 0) return;
    const page = Math.floor(idx / table.getState().pagination.pageSize);
    if (page !== table.getState().pagination.pageIndex) table.setPageIndex(page);
    requestAnimationFrame(() => rowRefs.current.get(selectedId)?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
  }, [selectedId, table]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-8 max-w-xs"
          placeholder={placeholder}
          value={globalFilter}
          onChange={(e) => {
            setGlobalFilter(e.target.value);
            table.setPageIndex(0);
          }}
        />
        <span className="text-xs text-muted-foreground">{table.getFilteredRowModel().rows.length} rows · click a header to sort</span>
        {toolbar}
        <div className="relative ml-auto">
          <Button size="sm" variant="outline" onClick={() => setShowCols((s) => !s)}>
            Columns
          </Button>
          {showCols && (
            <div className="absolute right-0 z-30 mt-1 max-h-80 w-56 overflow-auto rounded-md border bg-popover p-2 shadow-lg">
              {table
                .getAllLeafColumns()
                .filter((c) => c.getCanHide())
                .map((c) => (
                  <label key={c.id} className="flex items-center gap-2 py-0.5 text-xs">
                    <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                    {typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}
                  </label>
                ))}
            </div>
          )}
        </div>
      </div>
      <div className="overflow-auto rounded-md border" style={maxHeight ? { maxHeight } : undefined}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  const canSort = h.column.getCanSort();
                  return (
                    <th
                      key={h.id}
                      className={`px-2 py-1.5 text-left font-medium whitespace-nowrap select-none ${canSort ? "cursor-pointer hover:text-foreground" : ""}`}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {canSort && (
                        <span className={sorted ? "text-orange-400" : "text-muted-foreground/40"}>
                          {sorted === "asc" ? " ▲" : sorted === "desc" ? " ▼" : " ⇅"}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((r) => (
              <tr
                key={r.id}
                ref={(el) => {
                  if (el) rowRefs.current.set(r.id, el);
                  else rowRefs.current.delete(r.id);
                }}
                className={`border-t ${r.id === selectedId ? "bg-orange-500/15" : "hover:bg-muted/40"} ${onRowClick ? "cursor-pointer" : ""}`}
                onClick={onRowClick ? () => onRowClick(r.original) : undefined}
                onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(r.original) : undefined}
              >
                {r.getVisibleCells().map((c) => (
                  <td key={c.id} className="px-2 py-1 whitespace-nowrap">
                    {flexRender(c.column.columnDef.cell, c.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td className="px-2 py-6 text-center text-muted-foreground" colSpan={columns.length}>
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs">
          <Button size="xs" variant="outline" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            Prev
          </Button>
          <span>
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </span>
          <Button size="xs" variant="outline" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
