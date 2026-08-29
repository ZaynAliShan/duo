import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.js",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

const dev = process.env.NODE_ENV === "development";
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supaWs = SUPABASE.replace(/^http/, "ws");
// Report-Only first: it logs violations in the console without ever breaking a page. Flip to
// "Content-Security-Policy" once a few days of real use show it clean.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  `img-src 'self' data: blob: ${SUPABASE} http://127.0.0.1:* http://localhost:* http://host.docker.internal:*`,
  `connect-src 'self' ${SUPABASE} ${supaWs} http://127.0.0.1:* ws://127.0.0.1:* http://localhost:* ws://localhost:*`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withSerwist(nextConfig);
