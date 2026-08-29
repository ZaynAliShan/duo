import "./globals.css";
import "./app-extra.css";

export const metadata = {
  title: "Duo 💛",
  description: "A cozy little world for two — spending, plans, notes and small celebrations.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Duo", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFF7EA" },
    { media: "(prefers-color-scheme: dark)", color: "#2B2119" },
  ],
};

// dev only: an old production service worker (serwist, cacheOnNavigation) would keep serving stale pages
const devSwKill = process.env.NODE_ENV === "development"
  ? `if("serviceWorker"in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){var had=rs.length;rs.forEach(function(r){r.unregister()});if(window.caches){caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k)})})}if(had&&!sessionStorage.getItem("duo-sw-reloaded")){sessionStorage.setItem("duo-sw-reloaded","1");location.reload()}});}`
  : "";
const themeScript = `try{document.documentElement.dataset.theme=localStorage.getItem("duo-theme")==="dark"?"dark":"light";}catch(e){document.documentElement.dataset.theme="light";}`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {devSwKill && <script dangerouslySetInnerHTML={{ __html: devSwKill }} />}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400..900&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
