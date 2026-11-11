import type { Metadata, Viewport } from "next";
import { UnifrakturMaguntia, IM_Fell_English, IM_Fell_English_SC } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { WalletProvider } from "@/components/Wallet";
import "./globals.css";

const blackletter = UnifrakturMaguntia({ weight: "400", subsets: ["latin"], variable: "--font-blackletter" });
const fell = IM_Fell_English({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-fell" });
const fellSc = IM_Fell_English_SC({ weight: "400", subsets: ["latin"], variable: "--font-fell-sc" });

const DESCRIPTION =
  "A memecoin that eats other memecoins. Feed it DOGE, PEPE or SHIB and it pays you in $CONSUME. What it eats stays in its stomach, and every $CONSUME is a claim on it. Built on NEAR for NEAR HACKATHON.";
const SHARE_TITLE = "CONSUME: the memecoin that eats memecoins";

// Links in the share card (opengraph-image.png, twitter-image.png) must be
// absolute. Set NEXT_PUBLIC_SITE_URL to serve the site from another address.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://consume.cash"),
  title: { default: "CONSUME: the memecoin that eats memecoins, on NEAR", template: "%s | CONSUME" },
  description: DESCRIPTION,
  icons: { icon: "/icon.svg" },
  openGraph: { type: "website", siteName: "CONSUME", title: SHARE_TITLE, description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: DESCRIPTION },
};

// Visit counts, on the hosted site only. Vercel Analytics is served by Vercel itself, so it is
// left out everywhere else: a local build would ask for a script that is not there. Google
// Analytics loads only when NEXT_PUBLIC_GA_ID holds a measurement ID (G-...). Neither sees a
// wallet, an account name or anything typed into the page.
const ON_VERCEL = Boolean(process.env.VERCEL);
const GA_ID = /^G-[A-Z0-9]+$/.test(process.env.NEXT_PUBLIC_GA_ID ?? "") ? process.env.NEXT_PUBLIC_GA_ID : undefined;

export const viewport: Viewport = { themeColor: "#efe9dc" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${blackletter.variable} ${fell.variable} ${fellSc.variable}`}>
      <body>
        <WalletProvider>{children}</WalletProvider>
        {ON_VERCEL && <Analytics />}
        {GA_ID && (
          <>
            <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
            <Script id="google-analytics" strategy="afterInteractive">
              {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}
