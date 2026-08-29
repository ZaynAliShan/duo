"use client";
import { useEffect, useRef } from "react";

/** Bottom sheet on phones, centred card on desktop — the prototype's .sheet + .backdrop. */
export default function Sheet({ open, onClose, children, className = "" }) {
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    addEventListener("keydown", onKey);
    const prev = document.activeElement;
    ref.current?.focus();
    return () => { removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, [open, onClose]);
  return (
    <>
      <div className={"backdrop" + (open ? " show" : "")} onClick={onClose} />
      {/* inert keeps the hidden sheet out of the tab order and the accessibility tree */}
      <div ref={ref} tabIndex={-1} inert={open ? undefined : true}
        className={"sheet " + className + (open ? " show" : "")} role="dialog" aria-modal={open || undefined}>
        <div className="grabber" />
        {children}
      </div>
    </>
  );
}
