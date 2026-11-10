import type { Metadata, Viewport } from "next";
import { UnifrakturMaguntia, IM_Fell_English, IM_Fell_English_SC } from "next/font/google";
import { WalletProvider } from "@/components/Wallet";
import "./globals.css";

const blackletter = UnifrakturMaguntia({ weight: "400", subsets: ["latin"], variable: "--font-blackletter" });
const fell = IM_Fell_English({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-fell" });
const fellSc = IM_Fell_English_SC({ weight: "400", subsets: ["latin"], variable: "--font-fell-sc" });

const DESCRIPTION =
  "A memecoin that eats other memecoins. Feed it DOGE, PEPE or SHIB and it pays you in $CONSUME. What it eats stays in its stomach, and every $CONSUME is a claim on it. Built on NEAR.";
const SHARE_TITLE = "CONSUME: where memecoins go to be eaten";

// Links in the share card (opengraph-image.png, twitter-image.png) must be
// absolute. Set NEXT_PUBLIC_SITE_URL to serve the site from another address.
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://consume.cash"),
  title: "CONSUME",
  description: DESCRIPTION,
  icons: { icon: "/icon.svg" },
  openGraph: { type: "website", siteName: "CONSUME", title: SHARE_TITLE, description: DESCRIPTION, url: "/" },
  twitter: { card: "summary_large_image", title: SHARE_TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = { themeColor: "#efe9dc" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${blackletter.variable} ${fell.variable} ${fellSc.variable}`}>
      <body>
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
