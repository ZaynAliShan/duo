"use client";
import { useEffect, useRef } from "react";

/** Tap-to-edit text, the corkboard way. `editing` puts the caret at the end; onCommit(text) on blur/Enter. */
export default function Editable({ value, placeholder, className = "", editing, onStart, onCommit, as = "span", disabled }) {
  const ref = useRef();
  useEffect(() => { if (ref.current && !editing) ref.current.textContent = value || ""; }, [value, editing]);
  useEffect(() => {
    if (!editing || !ref.current) return;
    const el = ref.current;
    if (!value) el.textContent = "";
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }, [editing]);
  const Tag = as;
  // the placeholder is CSS (attr()) — rendering it as a React child of a node whose text we
  // manage imperatively makes React remove a text node that's already gone → NotFoundError
  return (
    <Tag ref={ref} className={className + (!value && !editing ? " empty" : "")}
      data-placeholder={placeholder || ""}
      contentEditable={editing ? "true" : "false"} suppressContentEditableWarning
      onClick={(e) => { e.stopPropagation(); if (!editing && !disabled) onStart?.(); }}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
      onBlur={(e) => { if (editing) onCommit?.(e.currentTarget.textContent.trim()); }} />
  );
}
