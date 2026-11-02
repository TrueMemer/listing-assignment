"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function useUnsavedChanges(dirty: boolean) {
  const router = useRouter();
  const [destination, setDestination] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        !(event.target instanceof Element)
      )
        return;
      const anchor = event.target.closest("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      )
        return;
      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname + url.search ===
          window.location.pathname + window.location.search
      )
        return;
      event.preventDefault();
      setDestination(url.pathname + url.search + url.hash);
    }
    function navigate(event: Event) {
      if (
        !(event instanceof CustomEvent) ||
        !event.detail ||
        typeof event.detail.href !== "string"
      )
        return;
      event.preventDefault();
      setDestination(event.detail.href);
    }
    document.addEventListener("click", click, true);
    window.addEventListener("fieldnotes:navigate", navigate);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("fieldnotes:navigate", navigate);
    };
  }, [dirty]);
  return {
    leaveOpen: destination !== null,
    cancelLeave: () => setDestination(null),
    confirmLeave: () => {
      if (destination) {
        const href = destination;
        setDestination(null);
        router.push(href);
      }
    },
  };
}

export function navigateFromCommand(
  href: string,
  push: (href: string) => void,
) {
  if (
    window.dispatchEvent(
      new CustomEvent("fieldnotes:navigate", {
        detail: { href },
        cancelable: true,
      }),
    )
  )
    push(href);
}
