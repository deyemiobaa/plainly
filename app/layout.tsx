import type { Metadata } from "next";
import { Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Plainly",
    template: "%s · Plainly",
  },
  description:
    "Plain-language summaries of bills, broken down by how they affect different people.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${sourceSerif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-(--page) text-(--ink)">
        <header className="border-b border-(--rule)">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
            <Link href="/" className="font-serif text-lg text-(--ink)">
              Plainly
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link
                href="/"
                className="text-(--muted) hover:text-(--ink)"
              >
                Home
              </Link>
              {/* <Link
                href="/process"
                className="text-(--muted) hover:text-(--ink)"
              >
                Process
              </Link> */}
            </nav>
          </div>
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="border-t border-(--rule)">
          <p className="mx-auto max-w-5xl px-5 py-6 text-sm leading-6 text-(--muted) sm:px-8">
            Plain-language summary, not legal advice. Always check the original
            bill before acting on it.
          </p>
        </footer>
      </body>
    </html>
  );
}
