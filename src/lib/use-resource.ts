"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { api } from "./http";

export function useResource<T>(url: string | null, schema: z.ZodType<T>) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const schemaRef = useRef(schema);
  schemaRef.current = schema;
  useEffect(() => {
    if (!url) {
      setLoading(false);
      return;
    }
    const abort = new AbortController();
    setLoading(true);
    setError("");
    api(url, schemaRef.current, { signal: abort.signal })
      .then((value) => {
        if (!abort.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!abort.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not load the records.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [url, version]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { data, setData, loading, error, refresh };
}
