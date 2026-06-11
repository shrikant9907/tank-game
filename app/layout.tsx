import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Tankar Game",
  description: "A retro full-screen tank battle game built with Next.js and Canvas."
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
