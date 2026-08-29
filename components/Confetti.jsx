"use client";
import { useEffect } from "react";
import confetti from "canvas-confetti";
import { useDuo } from "./DuoProvider";

const COLORS = ["#FFD97A", "#FFB59E", "#A9C6A0", "#ABD3DE", "#E8846B", "#F2BE4A"];
export function fireConfetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  confetti({ particleCount: 140, spread: 80, origin: { y: 0.35 }, colors: COLORS, scalar: 1.1, zIndex: 60 });
}
export default function Confetti() {
  const { setConfetti } = useDuo();
  useEffect(() => { setConfetti(fireConfetti); }, [setConfetti]);
  return null;
}
/** the little 💛 that floats off a tapped heart */
export function heartPop(el) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const s = document.createElement("div");
  s.className = "float-heart"; s.textContent = "💛";
  s.style.left = r.left + 2 + "px"; s.style.top = r.top - 6 + "px";
  document.body.appendChild(s);
  setTimeout(() => s.remove(), 1000);
}
