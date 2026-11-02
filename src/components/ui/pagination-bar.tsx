"use client";

import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react";
import { pageSizes } from "@/domain/catalog";
import { ComboBox } from "./combo-box";

export interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
}
export function PaginationBar({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [...pageSizes],
}: PaginationBarProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const sizes = [...new Set([...pageSizeOptions, pageSize])].sort(
    (a, b) => a - b,
  );
  return (
    <div className="flex flex-col gap-4 border-t border-base-300 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-base-content/70 tabular-nums">
        {total === 0 ? "0 results" : `${first}–${last} of ${total}`}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="text-base-content/70">Rows</span>
            <ComboBox
              className="w-20"
              value={String(pageSize)}
              placeholder="Rows per page"
              options={sizes.map((size) => ({
                value: String(size),
                label: String(size),
              }))}
              onChange={(next) => onPageSizeChange(Number(next))}
            />
          </div>
        )}
        <span className="tabular-nums">
          Page {page} of {pages}
        </span>
        <nav className="join" aria-label="Pagination">
          <button
            type="button"
            className="btn btn-square join-item"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <CaretLeftIcon size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="btn btn-square join-item"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => onPageChange(page + 1)}
          >
            <CaretRightIcon size={18} aria-hidden="true" />
          </button>
        </nav>
      </div>
    </div>
  );
}
