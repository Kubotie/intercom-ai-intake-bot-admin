import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "error" | "info" | "purple" | "muted";

const variants: Record<Variant, string> = {
  default:  "bg-zinc-100 text-zinc-700 border-zinc-200",
  success:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  warning:  "bg-amber-50 text-amber-700 border-amber-200",
  error:    "bg-red-50 text-red-700 border-red-200",
  info:     "bg-blue-50 text-blue-700 border-blue-200",
  purple:   "bg-purple-50 text-purple-700 border-purple-200",
  muted:    "bg-zinc-50 text-zinc-400 border-zinc-100",
};

export function Badge({ children, variant = "default", className }: {
  children: React.ReactNode; variant?: Variant; className?: string;
}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border",
      variants[variant], className
    )}>
      {children}
    </span>
  );
}

export function categoryBadge(category: string | null) {
  const map: Record<string, Variant> = {
    experience_issue: "purple",
    usage_guidance:   "info",
    bug_report:       "error",
    tracking_issue:   "warning",
    billing_contract: "warning",
    login_account:    "muted",
    report_difference:"muted",
  };
  return <Badge variant={map[category ?? ""] ?? "default"}>{category ?? "—"}</Badge>;
}

export function replySourceBadge(source: string | null) {
  const map: Record<string, Variant> = {
    faq_answer:         "purple",
    help_center_answer: "info",
    known_bug_match:    "warning",
    next_message:       "default",
    handoff:            "warning",
    escalation:         "error",
    fallback:           "muted",
    already_handed_off: "muted",
  };
  return <Badge variant={map[source ?? ""] ?? "default"}>{source ?? "—"}</Badge>;
}

export function statusBadge(status: string | null) {
  const map: Record<string, Variant> = {
    collecting:       "info",
    ready_for_handoff:"warning",
    handed_off:       "success",
    escalated:        "error",
    answered:         "success",
  };
  return <Badge variant={map[status ?? ""] ?? "default"}>{status ?? "—"}</Badge>;
}
