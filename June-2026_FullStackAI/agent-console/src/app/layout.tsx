import type { Metadata } from "next";
import { ConsoleProvider } from "@/context/ConsoleContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Alchemyst Agent Console - Real-Time AI Orchestration Feed",
  description: "Advanced agent execution cockpit with real-time stream reordering, timeline event tracing, and lazy diffing context inspector.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ConsoleProvider>
          {children}
        </ConsoleProvider>
      </body>
    </html>
  );
}
