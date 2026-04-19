export function generateOrderNumber(sequence: number, prefix: "DIN" | "TKW") {
  return `${prefix}-${String(sequence).padStart(4, "0")}`;
}
