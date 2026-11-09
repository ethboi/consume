import type { Metadata, Viewport } from "next";
import { UnifrakturMaguntia, IM_Fell_English, IM_Fell_English_SC } from "next/font/google";
import { WalletProvider } from "@/components/Wallet";
import "./globals.css";

const blackletter = UnifrakturMaguntia({ weight: "400", subsets: ["latin"], variable: "--font-blackletter" });
const fell = IM_Fell_English({ weight: "400", style: ["normal", "italic"], subsets: ["latin"], variable: "--font-fell" });
const fellSc = IM_Fell_English_SC({ weight: "400", subsets: ["latin"], variable: "--font-fell-sc" });

export const metadata: Metadata = {
  title: "CONSUME",
  description:
    "A memecoin that eats other memecoins. Feed it DOGE, PEPE or SHIB and it pays you in $CONSUME. What it eats stays in its stomach, and every $CONSUME is a claim on it. Built on NEAR.",
  icons: { icon: "/icon.svg" },
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
