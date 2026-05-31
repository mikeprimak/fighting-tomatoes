import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { AppDownloadBanner } from "@/components/layout/AppDownloadBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Good Fights",
    template: "%s — Good Fights",
  },
  description: "Rate and review MMA, boxing, and combat sports fights. See community ratings, hype scores, and discover the best fights.",
  metadataBase: new URL("https://goodfights.app"),
  verification: {
    google: "nLyzkvfUZ_LK4-5jKBcwGkF4CZFB_HbwnpXHDA1B5pU",
  },
  openGraph: {
    type: "website",
    siteName: "Good Fights",
    title: "Good Fights — Highly Rated Combat Sports Fights",
    description: "Rate and review MMA, boxing, and combat sports fights.",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          <AppDownloadBanner />
          <Navbar />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-4">
            {children}
          </main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
