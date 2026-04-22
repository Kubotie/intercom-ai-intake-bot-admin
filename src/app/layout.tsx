import type { Metadata } from "next";
import "./globals.css";
import { AppSidebar } from "@/components/layout/app-sidebar";

export const metadata: Metadata = {
  title: "Bot Admin — Ptengine",
  description: "AI Support Bot 運用管理コンソール",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <div className="flex h-screen overflow-hidden">
          <AppSidebar />
          <main className="flex-1 overflow-y-auto bg-[var(--background)]">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
