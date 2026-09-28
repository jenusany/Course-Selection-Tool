import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Western Course Selection",
  description: "Faculty of Science course selection — first draft",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
