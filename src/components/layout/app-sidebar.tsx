"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, MessageSquare, Star, FileText,
  Zap, BookOpen, Users, ScrollText, FlaskConical, Settings, Bot, TestTube2,
  User, LogOut, Network, PenLine,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ALL_NAV = [
  { href: "/overview",       icon: LayoutDashboard, label: "Overview" },
  { href: "/conversations",  icon: MessageSquare,   label: "Conversations" },
  { href: "/evaluation",     icon: Star,            label: "Evaluation" },
  { href: "/policies",       icon: FileText,        label: "Policies" },
  { href: "/workflows",      icon: Network,         label: "Workflows" },
  { href: "/skills",         icon: Zap,             label: "Skills" },
  { href: "/prompts",        icon: PenLine,         label: "Prompts" },
  { href: "/knowledge",      icon: BookOpen,        label: "Knowledge" },
  { href: "/concierges",     icon: Users,           label: "Concierges" },
  { href: "/test-targets",   icon: TestTube2,       label: "Test Targets" },
  { href: "/logs",           icon: ScrollText,      label: "Logs" },
  { href: "/sandbox",        icon: FlaskConical,    label: "Sandbox" },
];

type SessionUser = { email: string; name: string; role: string | null };

export function AppSidebar() {
  const path   = usePathname();
  const router = useRouter();
  const [user,         setUser]         = useState<SessionUser | null>(null);
  const [roleScreens,  setRoleScreens]  = useState<Record<string, string[]> | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then(r => r.json())
      .then(d => { if (d.user) setUser(d.user); })
      .catch(() => {});
    fetch("/api/role-screens")
      .then(r => r.json())
      .then(d => setRoleScreens(d))
      .catch(() => {});
  }, []);

  const role = user?.role ?? null;
  const allowedScreens = role && role !== "admin" && roleScreens ? roleScreens[role] : null;
  const NAV = allowedScreens
    ? ALL_NAV.filter(item => allowedScreens.includes(item.href))
    : ALL_NAV;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  };

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
      <div className="border-t border-[var(--sidebar-border)] p-3 space-y-1">
        {/* Current user */}
        {user && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            <div className="w-5 h-5 rounded-full bg-zinc-600 flex items-center justify-center shrink-0">
              <User size={11} className="text-zinc-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-white truncate leading-tight">{user.name}</p>
              {user.role && (
                <p className="text-[10px] text-zinc-400 truncate leading-tight">{user.role}</p>
              )}
            </div>
            <button
              onClick={logout}
              title="ログアウト"
              className="shrink-0 text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              <LogOut size={13} />
            </button>
          </div>
        )}
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors",
            path === "/settings"
              ? "bg-[var(--sidebar-accent)] text-white"
              : "text-[var(--sidebar-text)] hover:bg-[var(--sidebar-accent)] hover:text-white"
          )}
        >
          <Settings size={15} strokeWidth={1.8} />
          <span>Settings</span>
        </Link>
      </div>
    </aside>
  );
}
