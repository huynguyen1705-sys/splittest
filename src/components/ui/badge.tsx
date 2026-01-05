import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        success: "border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        warning: "border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400",
        info: "border-transparent bg-sky-500/10 text-sky-600 dark:text-sky-400",
        draft: "border-transparent bg-slate-500/10 text-slate-600 dark:text-slate-400",
        active: "border-transparent bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        paused: "border-transparent bg-amber-500/10 text-amber-600 dark:text-amber-400",
        completed: "border-transparent bg-slate-500/10 text-slate-500",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant, ...props }, ref) => {
  return (
    <div ref={ref} className={cn(badgeVariants({ variant }), className)} {...props} />
  );
});
Badge.displayName = "Badge";

export { Badge, badgeVariants };
