import type { Metadata } from "next";

import { ApplicationShell } from "@/app/application-shell";
import type { ProgressiveTutorialResponse } from "@/app/tutorial-progressive";
import { readTutorialsForLayout } from "@/app/server-data";

import "./globals.css";

export const metadata: Metadata = {
  title: "NextLearning | AI-Powered Education",
  description:
    "An interactive AI learning dashboard for focused, insight-driven study sessions.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let initialTutorials: ProgressiveTutorialResponse[] = [];

  try {
    initialTutorials = (await readTutorialsForLayout()) as ProgressiveTutorialResponse[];
  } catch (error) {
    console.error("Initial tutorial status could not be loaded:", error);
  }

  return (
    <html lang="en">
      <body>
        <ApplicationShell initialTutorials={initialTutorials}>
          {children}
        </ApplicationShell>
      </body>
    </html>
  );
}
