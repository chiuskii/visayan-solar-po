import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Visayan Solar PO System", template: "%s · Visayan Solar PO" },
  description: "Purchase order management for Visayan Solar",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
