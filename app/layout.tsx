import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BEAM-NET – Air‑Gapped Optical Data Transfer",
  description:
    "Transfer files between devices completely offline using sequential QR codes. No Wi‑Fi, Bluetooth, or internet required.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
