import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const sans = localFont({
  src: "../../node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2",
  variable: "--font-sans",
  display: "swap",
});
export const metadata: Metadata = {
  title: "Fieldnotes | Listing workspace",
  description: "Write and review property descriptions from checked facts.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={sans.variable}>{children}</body>
    </html>
  );
}
