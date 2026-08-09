import type { Metadata } from "next";
import "./globals.css";
import ThemeProviderWrapper from "@/components/ThemeProviderWrapper";

export const metadata: Metadata = {
  title: "BEAM-NET | Air-Gapped Optical Transfer",
  description: "Hybrid optical streaming & instant 6-digit passkey file exchange",
  manifest: "/manifest.json",
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="%2309090b"/><text y=".9em" x="5" font-size="80">📡</text></svg>',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 transition-colors duration-200 min-h-screen">
        <ThemeProviderWrapper>{children}</ThemeProviderWrapper>
      </body>
    </html>
  );
}
