import type { Metadata, Viewport } from "next";
import { Sora, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Sora({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["500", "600", "700", "800"],
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "BESC Engagement Checker — Score your post before you post it",
  description:
    "Paste your draft post and get an instant, transparent score built on the real ranking weights and visibility-filtering rules from X's open-sourced For You algorithm.",
  metadataBase: new URL("https://besc.services"),
  openGraph: {
    title: "BESC Engagement Checker",
    description:
      "Score your X post before you post it — grounded in the real, open-sourced ranking algorithm.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#05060a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="bg-void text-white font-sans antialiased selection:bg-besc-400/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
