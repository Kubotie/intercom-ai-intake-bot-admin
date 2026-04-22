import { cn } from "@/lib/utils";

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-[var(--border)]">
      {children}
    </thead>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn(
      "px-4 py-2.5 text-left text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wide whitespace-nowrap",
      className
    )}>
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[var(--border-subtle)]">{children}</tbody>;
}

export function Tr({ children, onClick, className }: {
  children: React.ReactNode; onClick?: () => void; className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "hover:bg-zinc-50 transition-colors",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={cn("px-4 py-3 text-[var(--text-secondary)] whitespace-nowrap", className)}>
      {children}
    </td>
  );
}
