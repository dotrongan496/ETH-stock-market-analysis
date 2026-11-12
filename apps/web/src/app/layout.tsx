import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_INIT_SCRIPT } from "@/lib/theme-script";

import "./globals.css";

// The "vietnamese" subset is required for the diacritics in the UI (ơ, ư, ạ, ...).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Biểu đồ giá quy đổi VND · ETH Market",
  description: "Biểu đồ nến cổ phiếu Việt Nam và crypto, giá quy đổi sang VND.",
};

// Updated client-side when the theme switch is flipped (lib/theme.ts).
export const viewport: Viewport = {
  themeColor: "#0b0e14",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the <head> script sets data-theme before React hydrates.
    <html lang="vi" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full bg-canvas font-sans text-ink">{children}</body>
    </html>
  );
}
