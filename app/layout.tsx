import { Analytics } from "@vercel/analytics/next";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/header";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Workshop: a control room for Dedalus Machines", template: "%s · Workshop" },
  description:
    "An unofficial concept by Hafsa Usmani: making AI infrastructure feel effortless. Built on the public Dedalus DCS API spec, running against a simulated control plane.",
};

export const viewport: Viewport = { themeColor: "#09090b", colorScheme: "dark" };

/**
 * Runs before first paint:
 * 1. Tells CSS whether this visitor has a saved fleet, so the server-rendered
 *    fallback shows the empty state or a skeleton without a flash.
 * 2. Starts installing the simulator's Service Worker while JS downloads.
 */
const PREPAINT = `(function(){try{
var d=document.documentElement,seeded=/[?&]seed=/.test(location.search);
d.dataset.fleet=(!seeded&&localStorage.getItem("workshop.sim.v1"))?"saved":"empty";
if("serviceWorker" in navigator&&location.pathname.indexOf("/about")!==0)navigator.serviceWorker.register("/mockServiceWorker.js").catch(function(){});
}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-fleet is set by PREPAINT before hydration, hence suppressHydrationWarning.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREPAINT }} />
      </head>
      <body className="flex min-h-dvh flex-col font-sans">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink"
        >
          Skip to content
        </a>
        <div className="grid-bg pointer-events-none fixed inset-x-0 top-0 -z-10 h-[520px]" aria-hidden />
        <Header />
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-8 pb-24">
          {children}
        </main>
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-6 text-xs text-dim">
            <span>
              Unofficial concept by{" "}
              <a className="text-muted underline-offset-4 hover:text-fg hover:underline" href="https://hafsausmani.com">
                Hafsa Usmani
              </a>
              . Not affiliated with Dedalus Labs.
            </span>
            <a
              className="text-muted underline-offset-4 hover:text-fg hover:underline"
              href="https://github.com/hafsau/dedalus-demo"
            >
              Source
            </a>
          </div>
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
