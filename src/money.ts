/** Format satang as Thai baht, e.g. 123450 -> "฿1,234.50". */
export function formatBaht(satang: number): string {
  const baht = satang / 100
  return "฿" + baht.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
