import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom border-collapse text-sm", className)} {...props} />
    </div>
  );
}
export const THead = ({ className, ...p }: ComponentProps<"thead">) => <thead className={cn("bg-muted/60", className)} {...p} />;
export const TBody = ({ className, ...p }: ComponentProps<"tbody">) => <tbody className={cn("[&_tr:last-child]:border-0", className)} {...p} />;
export const TR = ({ className, ...p }: ComponentProps<"tr">) => <tr className={cn("border-b transition-colors", className)} {...p} />;
export const TH = ({ className, ...p }: ComponentProps<"th">) => (
  <th className={cn("h-9 whitespace-nowrap px-3 text-left text-xs font-medium text-muted-foreground", className)} {...p} />
);
export const TD = ({ className, ...p }: ComponentProps<"td">) => <td className={cn("whitespace-nowrap px-3 py-2.5", className)} {...p} />;
