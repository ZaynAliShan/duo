/** The six warm avatar swatches. Each one carries the soft/text pair the prototype's
 *  --you / --him tokens expect, in both themes, so every component keeps working. */
export const SWATCHES = [
  { key: "coral",  main: "#E8846B", soft: "#FBE3DB", text: "#9E3D26", darkSoft: "#4A3129", darkText: "#FFB59E" },
  { key: "sage",   main: "#7FA477", soft: "#E4EEDF", text: "#40603B", darkSoft: "#33402C", darkText: "#BFDCB4" },
  { key: "butter", main: "#F2BE4A", soft: "#FBEFD0", text: "#7A5426", darkSoft: "#4A3D24", darkText: "#FFD97A" },
  { key: "sky",    main: "#6FA7C7", soft: "#DDEBF0", text: "#2F5468", darkSoft: "#28393F", darkText: "#ABD3DE" },
  { key: "rose",   main: "#E38BA8", soft: "#F9DEE7", text: "#A34D6B", darkSoft: "#4A2C38", darkText: "#F3B8CC" },
  { key: "lilac",  main: "#A48BCF", soft: "#E2D6F3", text: "#5B4485", darkSoft: "#3A304A", darkText: "#C9B6E4" },
];
export const swatchFor = (hex) =>
  SWATCHES.find((s) => s.main.toLowerCase() === String(hex || "").toLowerCase()) || SWATCHES[0];

export const GOAL_COLORS = ["#ABD3DE", "#FFB59E", "#FFD97A", "#A9C6A0"];
export const GOAL_EMOJIS = ["🏔", "🛋", "✈️", "💍", "🏠", "🎓", "🐱", "🌊", "🎮", "🎁"];
export const BUCKET_EMOJIS = ["✨", "🌈", "🗺", "🎡", "🏝", "🎪", "🌌", "🍣", "🚗", "🌧"];
export const NOTE_COLORS = [
  { c: "n-butter", css: "var(--butter)", label: "butter yellow" },
  { c: "n-peach",  css: "var(--peach)",  label: "peach" },
  { c: "n-sage",   css: "var(--sage)",   label: "sage green" },
  { c: "n-sky",    css: "var(--sky)",    label: "sky blue" },
  { c: "n-rose",   css: "#F6CBD5",       label: "rose pink" },
  { c: "n-lilac",  css: "#E2D6F3",       label: "lilac" },
];
export const MOODS = ["😊", "🥰", "🤩", "😌", "😴", "🥱", "😤", "🤒"];
export const MOMENT_TAGS = [["✨", "little win"], ["🍚", "cooked together"], ["🎬", "movie night"], ["🚶", "long walk"], ["💛", "just us"]];
export const CAT_COLORS = {
  Food: "var(--coral)", Groceries: "var(--sage-deep)", Bills: "var(--butter-deep)",
  Transport: "var(--sky)", Fun: "var(--peach)", Gifts: "var(--him)", Other: "#B9A88F",
};
