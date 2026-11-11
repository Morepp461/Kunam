import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CALERIS MASTERS — Motorsport Roleplay",
  description:
    "Enter the world of CALERIS MASTERS. Build your team, develop your car, manage your career, and compete for the championship.",
  applicationName: "CALERIS MASTERS",
  openGraph: {
    title: "CALERIS MASTERS — Motorsport Roleplay",
    description: "A motorsport world where every decision moves the grid.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
