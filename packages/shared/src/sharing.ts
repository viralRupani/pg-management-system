/** Display label for a room's sharing type, derived from bed capacity. e.g. 2 -> "2-sharing". */
export function sharingLabel(capacity: number): string {
  return `${capacity}-sharing`;
}
