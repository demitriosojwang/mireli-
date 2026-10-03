import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mireli Compliance",
  description: "Driver compliance review and dispatch for Mi-Reli",
};

export const viewport: Viewport = {
  // Zoom must stay enabled — staff may need to enlarge a document image.
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#1f3a63",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}