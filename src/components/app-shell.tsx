"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { MoonIcon, SunIcon } from "@phosphor-icons/react";
import { Modal } from "./ui/modal";
import { CommandPalette } from "./ui/command-palette";

type Theme = "light" | "dark";
const shortcuts = [
  ["Commands", "Ctrl / ⌘ K"],
  ["Focus search", "/"],
  ["Keyboard shortcuts", "?"],
  ["Save listing", "Ctrl / ⌘ S"],
  ["Review listing", "Ctrl / ⌘ Enter"],
  ["AI suggestion", "Ctrl / ⌘ Shift G"],
];

export function AppShell({
  children,
  title,
}: {
  children: ReactNode;
  title?: string;
}) {
  const pathname = usePathname();
  const [theme, setTheme] = useState<Theme>("light");
  const [commandOpen, setCommandOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  useEffect(() => {
    let chosen: Theme = window.matchMedia("(prefers-color-scheme: dark)")
      .matches
      ? "dark"
      : "light";
    try {
      const saved = localStorage.getItem("fieldnotes.theme");
      if (saved === "light" || saved === "dark") chosen = saved;
    } catch {
      /* Theme preference is optional. */
    }
    document.documentElement.dataset.theme = chosen;
    setTheme(chosen);
  }, []);
  function toggleTheme() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    setTheme(next);
    try {
      localStorage.setItem("fieldnotes.theme", next);
    } catch {
      /* The selected theme still applies to this page. */
    }
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setShortcutsOpen(false);
        setCommandOpen((previous) => !previous);
        return;
      }
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        commandOpen ||
        shortcutsOpen ||
        event.defaultPrevented
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'input, textarea, [contenteditable="true"], [role="combobox"], [role="textbox"]',
        )
      )
        return;
      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
      }
      if (event.key === "/") {
        const search = document.querySelector<HTMLInputElement>(
          '[data-global-search], input[type="search"], input[role="searchbox"]',
        );
        if (search) {
          event.preventDefault();
          search.focus();
        }
      }
    }
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [commandOpen, shortcutsOpen]);
  const propertiesActive = pathname.startsWith("/properties");
  const listingsActive = pathname.startsWith("/listings");
  return (
    <div className="min-h-dvh bg-base-200">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-field focus:bg-base-100 focus:px-4 focus:py-3 focus:shadow-lg"
      >
        Skip to content
      </a>
      <header className="border-b border-base-300 bg-base-100">
        <div className="mx-auto flex min-h-16 max-w-[1440px] flex-wrap items-center gap-2 px-4 py-2 lg:px-8">
          <Link
            href="/properties"
            className="mr-4 text-lg font-semibold tracking-tight"
          >
            Fieldnotes
          </Link>
          <nav
            aria-label="Main navigation"
            className="order-3 w-full sm:order-none sm:w-auto"
          >
            <ul className="menu menu-horizontal gap-1 p-0">
              <li>
                <Link
                  href="/properties"
                  aria-current={propertiesActive ? "page" : undefined}
                  className={propertiesActive ? "menu-active" : ""}
                >
                  Properties
                </Link>
              </li>
              <li>
                <Link
                  href="/listings"
                  aria-current={listingsActive ? "page" : undefined}
                  className={listingsActive ? "menu-active" : ""}
                >
                  Listings
                </Link>
              </li>
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className="btn btn-ghost btn-square"
              aria-label="Toggle light and dark theme"
              onClick={toggleTheme}
            >
              {theme === "dark" ? (
                <SunIcon size={19} aria-hidden="true" />
              ) : (
                <MoonIcon size={19} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>
      </header>
      <main
        id="main-content"
        aria-label={title}
        className="mx-auto w-full max-w-[1440px] px-4 py-6 lg:px-8 lg:py-8"
      >
        {children}
      </main>
      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        onToggleTheme={toggleTheme}
        onShowShortcuts={() =>
          requestAnimationFrame(() => setShortcutsOpen(true))
        }
      />
      <Modal
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        title="Keyboard shortcuts"
      >
        <dl className="space-y-3">
          {shortcuts.map(([action, keys]) => (
            <div
              key={action}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <dt>{action}</dt>
              <dd>
                <kbd className="kbd kbd-sm whitespace-nowrap">{keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
      </Modal>
    </div>
  );
}
