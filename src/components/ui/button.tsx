import { cn } from "@/lib/utils";
import { type ButtonHTMLAttributes } from "react";

type Variant = "default" | "outline" | "ghost" | "destructive";
type Size    = "sm" | "md" | "lg" | "icon";

const variantClass: Record<Variant, string> = {
  default:     "bg-zinc-900 text-white hover:bg-zinc-800",
  outline:     "border border-[var(--border)] bg-white text-[var(--text-primary)] hover:bg-zinc-50",
  ghost:       "text-[var(--text-secondary)] hover:bg-zinc-100 hover:text-[var(--text-primary)]",
  destructive: "bg-red-600 text-white hover:bg-red-700",
};
const sizeClass: Record<Size, string> = {
  sm:   "h-7 px-2.5 text-xs rounded",
  md:   "h-8 px-3.5 text-sm rounded-md",
  lg:   "h-9 px-5 text-sm rounded-md",
  icon: "h-8 w-8 rounded-md flex items-center justify-center",
};

export function Button({
  children, variant = "default", size = "md", className, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variantClass[variant], sizeClass[size], className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
