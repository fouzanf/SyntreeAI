import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SyntreeAI — Query entire codebases in natural language",
  description: "Understand any codebase in seconds. SyntreeAI combines AST-aware tree-sitter chunking with cross-file context graphs and natural language querying for developers.",
  robots: "index, follow",
  openGraph: {
    title: "SyntreeAI — Query entire codebases in natural language",
    description: "Understand any codebase in seconds. SyntreeAI combines AST-aware tree-sitter chunking with cross-file context graphs.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  themeColor: "#0A0A0B",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#0A0A0B] text-[#EDEDED]">
        {children}
      </body>
    </html>
  );
}
