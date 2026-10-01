"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import { useFleet, useFleetStore } from "./providers";

export function Toasts() {
  const { toast } = useFleet();
  const store = useFleetStore();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => store.dismissToast(), toast.tone === "error" ? 6_000 : 2_500);
    return () => clearTimeout(t);
  }, [toast, store]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ type: "spring", stiffness: 500, damping: 34 }}
            className={`pointer-events-auto flex max-w-lg items-start gap-3 border bg-raised px-4 py-3 font-mono text-xs shadow-2xl ${
              toast.tone === "error" ? "border-danger/40 text-danger" : "border-line-strong text-fg"
            }`}
            role={toast.tone === "error" ? "alert" : "status"}
          >
            <span className="min-w-0 flex-1 break-words">{toast.message}</span>
            <button
              type="button"
              onClick={() => store.dismissToast()}
              className="text-dim hover:text-fg"
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
