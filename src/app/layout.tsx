import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { AnalysisAutoRunner } from "@/components/analysis-auto-runner";
import { Footer } from "@/components/footer";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ED BubblePlanner",
  description: "Plan a multi-system colony 'mini bubble' in Elite Dangerous.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} dark h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
          <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-6 px-4">
            <Link href="/" className="font-semibold tracking-tight">
              <span className="text-orange-500">ED</span> BubblePlanner
            </Link>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link href="/" className="hover:text-foreground">
                Planner
              </Link>
              <Link href="/about" className="hover:text-foreground">
                About &amp; credits
              </Link>
            </nav>
          </div>
        </header>
        <AnalysisAutoRunner />
        <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-4">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
