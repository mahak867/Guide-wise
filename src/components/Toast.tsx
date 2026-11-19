"use client";
import { useEffect, useRef } from "react";
import { Notice } from "./ui";

/**
 * Feedback after an action, pinned to the bottom of the screen so it is seen wherever the action was
 * taken (a palette change at the bottom of a long page used to report "Palette updated." off-screen).
 * A confirmation fades after a few seconds; an error stays until it is dismissed or the next action.
 */
export function Toast({ msg, err, onClose }: { msg: string | null; err: string | null; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });
  useEffect(() => {
    if (!msg || err) return;
    const t = setTimeout(() => close.current(), 8000);
    return () => clearTimeout(t);
  }, [msg, err]);
  if (!msg && !err) return null;
  return (
    <div className="fixed inset-x-4 bottom-4 z-30 print:hidden sm:left-auto sm:right-6 sm:w-[28rem]">
      <div className="relative rounded-md shadow-lg">
        <Notice tone={err ? "error" : "ok"}><span className="block pr-6">{err ?? msg}</span></Notice>
        <button type="button" aria-label="Dismiss message" className="absolute right-1.5 top-1 px-1.5 text-lg leading-none text-muted hover:text-ink" onClick={() => close.current()}>×</button>
      </div>
    </div>
  );
}
