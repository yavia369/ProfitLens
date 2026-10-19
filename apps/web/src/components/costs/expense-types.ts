/** Shared by the expenses page (server) and the expense form (client). */
export type ExpenseType = "one_time" | "recurring" | "per_order" | "percent_of_revenue" | "percent_of_net_sales" | "percent_of_ad_spend";

export const EXPENSE_TYPES: readonly { value: ExpenseType; label: string; hint: string }[] = [
  { value: "recurring", label: "Recurring", hint: "Subscriptions, salaries, rent. Fixed cost." },
  { value: "one_time", label: "One-time", hint: "Booked in full on its date. Fixed cost." },
  { value: "per_order", label: "Per order", hint: "Amount × orders each day (e.g. packaging inserts). Variable cost." },
  { value: "percent_of_revenue", label: "% of revenue", hint: "e.g. an app that charges a share of sales. Variable cost." },
  { value: "percent_of_net_sales", label: "% of net sales", hint: "Share of product sales after discounts and returns." },
  { value: "percent_of_ad_spend", label: "% of ad spend", hint: "e.g. an agency fee. Counted after ads." },
];
