"use client";

import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { navigateFromCommand } from "@/lib/use-unsaved-changes";
import {
  BuildingsIcon,
  ListBulletsIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  KeyboardIcon,
} from "@phosphor-icons/react";
import { Modal } from "./modal";

export function CommandPalette({
  open,
  onOpenChange,
  onToggleTheme,
  onShowShortcuts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleTheme: () => void;
  onShowShortcuts: () => void;
}) {
  const router = useRouter();
  function run(action: () => void) {
    onOpenChange(false);
    action();
  }
  const itemClass =
    "flex min-h-11 cursor-pointer items-center gap-3 rounded-field px-3 py-2 text-sm outline-none data-[selected=true]:bg-base-200";
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Commands"
      className="max-w-lg"
    >
      <Command label="Commands" loop>
        <div className="input w-full">
          <MagnifyingGlassIcon
            size={18}
            className="shrink-0 text-base-content/60"
            aria-hidden="true"
          />
          <Command.Input
            data-autofocus
            placeholder="Search commands"
            aria-label="Search commands"
            className="min-w-0 grow"
          />
        </div>
        <Command.List className="mt-3 max-h-72 overflow-y-auto">
          <Command.Empty className="px-3 py-4 text-sm text-base-content/60">
            No commands found
          </Command.Empty>
          <Command.Item
            value="Properties"
            keywords={["property", "catalog"]}
            className={itemClass}
            onSelect={() =>
              run(() => navigateFromCommand("/properties", router.push))
            }
          >
            <BuildingsIcon size={18} aria-hidden="true" />
            Properties
          </Command.Item>
          <Command.Item
            value="Listings"
            keywords={["listing", "draft", "description"]}
            className={itemClass}
            onSelect={() =>
              run(() => navigateFromCommand("/listings", router.push))
            }
          >
            <ListBulletsIcon size={18} aria-hidden="true" />
            Listings
          </Command.Item>
          <Command.Item
            value="Toggle theme"
            keywords={["light", "dark"]}
            className={itemClass}
            onSelect={() => run(onToggleTheme)}
          >
            <MoonIcon size={18} aria-hidden="true" />
            Toggle theme
          </Command.Item>
          <Command.Item
            value="Keyboard shortcuts"
            keywords={["help", "keys"]}
            className={itemClass}
            onSelect={() => run(onShowShortcuts)}
          >
            <KeyboardIcon size={18} aria-hidden="true" />
            Keyboard shortcuts
          </Command.Item>
        </Command.List>
      </Command>
    </Modal>
  );
}
