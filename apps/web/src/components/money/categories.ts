import type { ExpenseCategory, ExpenseRecord } from "@hoppin/core";
import { BedDouble, Car, CircleCheck, Receipt, ShoppingBag, Ticket, Utensils, type LucideIcon } from "lucide-react";

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: "Food",
  stay: "Stay",
  transport: "Transport",
  activity: "Activity",
  shopping: "Shopping",
  other: "Other",
};

export const CATEGORY_ICON: Record<ExpenseRecord["category"], LucideIcon> = {
  food: Utensils,
  stay: BedDouble,
  transport: Car,
  activity: Ticket,
  shopping: ShoppingBag,
  other: Receipt,
  payment: CircleCheck,
};
