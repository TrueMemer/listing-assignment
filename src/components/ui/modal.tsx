"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { XIcon } from "@phosphor-icons/react";
import { useId, useRef, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className = "",
}: ModalProps) {
  const descriptionId = useId();
  const content = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <div className="modal modal-open z-[70] p-4">
          <Dialog.Overlay className="absolute inset-0 bg-neutral/50" />
          <Dialog.Content
            ref={content}
            aria-describedby={description ? descriptionId : undefined}
            onOpenAutoFocus={(event) => {
              previousFocus.current =
                document.activeElement instanceof HTMLElement
                  ? document.activeElement
                  : null;
              const target = content.current?.querySelector<HTMLElement>(
                '[data-autofocus], input:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled])',
              );
              if (target) {
                event.preventDefault();
                target.focus();
              }
            }}
            onCloseAutoFocus={(event) => {
              if (previousFocus.current?.isConnected) {
                event.preventDefault();
                previousFocus.current.focus();
              }
            }}
            className={`modal-box relative z-10 max-h-[calc(100dvh-2rem)] ${className}`}
          >
            <Dialog.Title className="pr-12 text-lg font-semibold">
              {title}
            </Dialog.Title>
            {description && (
              <Dialog.Description
                id={descriptionId}
                className="mt-2 text-sm text-base-content/70"
              >
                {description}
              </Dialog.Description>
            )}
            <Dialog.Close asChild>
              <button
                type="button"
                className="btn btn-sm btn-square btn-ghost absolute right-4 top-4"
                aria-label="Close dialog"
              >
                <XIcon size={18} aria-hidden="true" />
              </button>
            </Dialog.Close>
            {children && <div className="mt-5">{children}</div>}
            {footer && <div className="modal-action">{footer}</div>}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  onConfirm,
  destructive = false,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  destructive?: boolean;
  pending?: boolean;
}) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      title={title}
      description={description}
      footer={
        <>
          <button
            type="button"
            className="btn"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn ${destructive ? "btn-error" : "btn-neutral"}`}
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && (
              <span
                className="loading loading-spinner loading-sm"
                aria-hidden="true"
              />
            )}
            {confirmLabel}
          </button>
        </>
      }
    >
      {pending ? (
        <span className="sr-only" role="status">
          Saving
        </span>
      ) : null}
    </Modal>
  );
}
