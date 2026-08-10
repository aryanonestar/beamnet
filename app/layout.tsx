import type { Metadata } from "next";
import "./globals.css";
import ThemeProviderWrapper from "@/components/ThemeProviderWrapper";

export const metadata: Metadata = {
  title: "BEAM-NET – Air‑Gapped Optical Data Transfer",
  description:
    "Transfer files between devices completely offline using sequential QR codes. No Wi‑Fi, Bluetooth, or internet required.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-[#131315] text-[#e5e1e4] antialiased">
        <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
      </body>
    </html>
  );
}
