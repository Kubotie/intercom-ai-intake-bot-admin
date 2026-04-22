import { cn } from "@/lib/utils";

export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-white rounded-lg border border-[var(--border)] shadow-sm", className)}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-5 py-4 border-b border-[var(--border)]", className)}>{children}</div>;
}

export function CardTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("text-sm font-semibold text-[var(--text-primary)]", className)}>{children}</h3>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function StatCard({ label, value, sub, accent }: {
  label: string; value: string | number; sub?: string; accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs text-[var(--text-muted)] font-medium uppercase tracking-wide mb-1">{label}</p>
        <p className={cn("text-2xl font-semibold tabular-nums", accent ?? "text-[var(--text-primary)]")}>{value}</p>
        {sub && <p className="text-xs text-[var(--text-muted)] mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}
