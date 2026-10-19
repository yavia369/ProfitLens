import {
  BadgeDollarSign,
  BarChart3,
  Coins,
  Boxes,
  CreditCard,
  FileSpreadsheet,
  LayoutDashboard,
  Megaphone,
  Receipt,
  RefreshCw,
  Scale,
  ShoppingBag,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Pages that use the shared report filters (store/date/compare) keep them in the URL when navigating. */
  readonly report?: boolean;
  /** Per-store pages (costs, policy, sync) keep the selected store in the URL. */
  readonly storeScoped?: boolean;
  /** Phase in which the page becomes functional, shown as a badge until then. */
  readonly plannedPhase?: number;
}

export const NAV: readonly { readonly title: string; readonly items: readonly NavItem[] }[] = [
  {
    title: "Analytics",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, report: true },
      { href: "/orders", label: "Orders", icon: ShoppingBag, report: true },
      { href: "/products", label: "Products", icon: Boxes, report: true },
      { href: "/pnl", label: "Profit & loss", icon: FileSpreadsheet, report: true },
      { href: "/advertising", label: "Advertising", icon: Megaphone, report: true, plannedPhase: 7 },
      { href: "/customers", label: "Customers", icon: Users, report: true },
    ],
  },
  {
    title: "Costs",
    items: [
      { href: "/costs/products", label: "Product costs", icon: BadgeDollarSign, storeScoped: true },
      { href: "/costs/shipping", label: "Shipping", icon: Truck, storeScoped: true },
      { href: "/costs/fees", label: "Transaction fees", icon: CreditCard, storeScoped: true },
      { href: "/costs/expenses", label: "Expenses", icon: Receipt, storeScoped: true },
      { href: "/costs/ad-spend", label: "Ad spend", icon: Coins, storeScoped: true },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/settings/stores", label: "Stores & integrations", icon: Store },
      { href: "/settings/policy", label: "Calculation policy", icon: Scale, storeScoped: true },
      { href: "/settings/sync", label: "Sync center", icon: RefreshCw },
    ],
  },
];

export const REPORT_PATHS = NAV.flatMap((g) => g.items.filter((i) => i.report).map((i) => i.href));
export { BarChart3 };
