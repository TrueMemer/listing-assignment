"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function useCatalogQuery() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.toString();
  const setQuery = useCallback(
    (
      changes: { [name: string]: string | number | null },
      preservePage = false,
    ) => {
      const next = new URLSearchParams(current);
      if (!preservePage) next.delete("page");
      for (const [name, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(name);
        else next.set(name, String(value));
      }
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
        scroll: false,
      });
    },
    [current, pathname, router],
  );
  const apiParams = new URLSearchParams(current);
  apiParams.delete("view");
  return { params, setQuery, queryString: apiParams.toString() };
}
