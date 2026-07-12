import { ComplaintCategory } from "@pg/shared";

export interface CategoryMeta {
  label: string;
  /** Icon name for <Icon> (the mobile Ionicons vocabulary, mapped in icon.tsx). */
  icon: string;
}

/** Resident-facing labels + icons for the API complaint categories. */
export const COMPLAINT_CATEGORIES: Record<ComplaintCategory, CategoryMeta> = {
  [ComplaintCategory.MAINTENANCE]: { label: "Maintenance", icon: "construct-outline" },
  [ComplaintCategory.CLEANLINESS]: { label: "Cleanliness", icon: "sparkles-outline" },
  [ComplaintCategory.FOOD]: { label: "Food / Mess", icon: "restaurant-outline" },
  [ComplaintCategory.WIFI]: { label: "Wi-Fi", icon: "wifi-outline" },
  [ComplaintCategory.SECURITY]: { label: "Security", icon: "shield-outline" },
  [ComplaintCategory.OTHER]: { label: "Other", icon: "ellipsis-horizontal-outline" },
};

export const categoryMeta = (c: string): CategoryMeta =>
  COMPLAINT_CATEGORIES[c as ComplaintCategory] ??
  COMPLAINT_CATEGORIES[ComplaintCategory.OTHER];
