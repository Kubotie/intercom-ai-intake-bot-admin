"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, MessageSquare, Star, FileText,
  GitBranch, Zap, BookOpen, Users, ScrollText, FlaskConical, Settings, Bot
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/overview",       icon: LayoutDashboard, label: "Overview" },
  { href: "/conversations",  icon: MessageSquare,   label: "Conversations" },
  { href: "/evaluation",     icon: Star,            label: "Evaluation" },
  { href: "/policies",       icon: FileText,        label: "Policies" },
  { href: "/intents",        icon: GitBranch,       label: "Intents & Routing" },
  { href: "/skills",         icon: Zap,             label: "Skills" },
  { href: "/knowledge",      icon: BookOpen,        label: "Knowledge" },
  { href: "/concierges",     icon: Users,           label: "Concierges" },
  { href: "/logs",           icon: ScrollText,      label: "Logs" },
  { href: "/sandbox",        icon: FlaskConical,    label: "Sandbox" },
];

export function AppSidebar() {
  const path = usePathname();
  return (
    <aside
      style={{ background: "var(--sidebar-bg)", borderRight: "1px solid var(--sidebar-border)", width: 220 }}
      className="flex flex-col shrink-0 h-screen sticky top-0"
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-14 border-b border-[var(--sidebar-border)]">
        <div className="w-7 h-7 rounded-md bg-zinc-700 flex items-center justify-center">
          <Bot size={15} className="text-white" />
        </div>
        <span className="text-white font-semibold text-sm">Bot Admin</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV.map(({ href, icon: Icon, label }) => {
          const active = path === href || path.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-4 py-2 mx-2 rounded-md text-sm transition-colors",
                active
                  ? "bg-[var(--sidebar-accent)] text-white"
                  : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-accent)] hover:text-white"
              )}
            >
              <Icon size={15} strokeWidth={1.8} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-[var(--sidebar-border)] p-3">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-2 py-2 rounded-md text-sm text-[var(--sidebar-text)] hover:bg-[var(--sidebar-accent)] hover:text-white transition-colors"
        >
          <Settings size={15} strokeWidth={1.8} />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
