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

    // Progressive-enhancement fallback when HTMLDialogElement.prototype.closedBy is unsupported
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
      <div className="flex items-start justify-between gap-4 border-b border-[#E5E1D8] bg-[#FAF8F4] px-5 py-4">
        <div className="min-w-0">
          <h2
            id={titleId}
            className="font-serif text-[22px] leading-tight text-[#141413] tracking-[-0.01em]"
          >
            {title}
          </h2>
          {subtitle && (
            <p className="mt-0.5 text-[12px] text-[#64625D]">{subtitle}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => dialogRef.current?.close()}
          aria-label={`Close ${title}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#E5E1D8] bg-white text-[#64625D] transition-colors hover:border-[#141413] hover:text-[#141413]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="studio-scroll flex-1 overflow-y-auto bg-white p-5">
        {children}
      </div>
    </dialog>
  );
}
