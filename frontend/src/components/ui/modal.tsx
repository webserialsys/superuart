"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

export function Modal({ open, onClose, title, description, children, className }: ModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open || !isMounted) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        className="absolute inset-0 h-full w-full cursor-default bg-slate-950/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close modal backdrop"
      />
      <div className="pointer-events-none relative z-10 h-full w-full overflow-y-auto px-4 py-6 sm:px-8 sm:py-10">
        <div
          className={cn(
            "pointer-events-auto mx-auto w-full max-w-4xl rounded-2xl border border-border/60 bg-card/95 p-6 shadow-2xl",
            className,
          )}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id={titleId} className="text-lg font-semibold">{title}</h3>
              {description ? (
                <p id={descriptionId} className="mt-1 text-sm text-muted-foreground">{description}</p>
              ) : null}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close modal">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
