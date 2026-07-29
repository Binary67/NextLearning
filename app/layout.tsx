import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NextLearning | AI-Powered Education",
  description:
    "An interactive AI learning dashboard for focused, insight-driven study sessions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
