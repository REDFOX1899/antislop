'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface NativeDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  widthClass?: string;
  children: React.ReactNode;
}

/**
 * Standards-compliant native HTML <dialog> modal following modern-web-guidance:
 * - Uses showModal() for top-layer, inert background, Esc handling, and focus return.
 * - Uses closedby="any" with a pointerdown/pointerup fallback for browsers without closedBy.
 * - Omits redundant role="dialog" and aria-modal.
 */
export function NativeDialog({
  open,
  onClose,
  title,
  subtitle,
  widthClass = 'w-[min(94vw,660px)]',
  children,
}: NativeDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => {
      dialog.returnValue = '';
      onCloseRef.current();
    };
    dialog.addEventListener('close', handleClose);

    const supportsClosedBy =
      typeof HTMLDialogElement !== 'undefined' &&
      'closedBy' in HTMLDialogElement.prototype;

    if (!supportsClosedBy) {
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onPointerUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e) && dialog.open) {
          dialog.close();
        }
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      return () => {
        dialog.removeEventListener('close', handleClose);
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleClose);
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className={widthClass}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] bg-[var(--bg-card-elevated)] px-5 py-4">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="text-[18px] font-medium leading-tight tracking-[-0.015em] text-[var(--ink-primary)]"
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-[var(--ink-secondary)]">
              {subtitle}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={`Close ${title}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border-card)] bg-[var(--bg-card)] text-[var(--ink-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--ink-primary)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="studio-scroll flex-1 overflow-y-auto bg-[var(--bg-card)] p-5">
        {children}
      </div>
    </dialog>
  );
}
