const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

/** Converts a plain decimal amount (comma or dot, at most two decimals) to safe BRL cents. */
export function parseMoneyInput(value: string): number | null {
  const match = /^(\d+)(?:[,.](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;

  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100n + fraction;
  if (cents <= 0n || cents > MAX_SAFE_CENTS) return null;
  return Number(cents);
}

/** Formats stored cents without a floating-point division or rounding step. */
export function formatCentsInput(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new RangeError("cents_must_be_a_non_negative_safe_integer");
  const exact = BigInt(cents);
  return `${exact / 100n},${String(exact % 100n).padStart(2, "0")}`;
}

/** Sums stored cents exactly, including collections larger than Number.MAX_SAFE_INTEGER. */
export function sumCents(values: readonly number[]): bigint {
  return values.reduce((sum, value) => {
    if (!Number.isSafeInteger(value)) throw new RangeError("cents_must_be_a_safe_integer");
    return sum + BigInt(value);
  }, 0n);
}

/** Formats exact cents as BRL; BigInt keeps large aggregate totals precise. */
export function formatMoney(cents: number | bigint): string {
  if (typeof cents === "number" && !Number.isSafeInteger(cents)) throw new RangeError("cents_must_be_a_safe_integer");
  const exact = typeof cents === "bigint" ? cents : BigInt(cents);
  const absolute = exact < 0n ? -exact : exact;
  const whole = absolute / 100n;
  const fraction = String(absolute % 100n).padStart(2, "0");
  const groupedWhole = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${exact < 0n ? "-" : ""}R$\u00a0${groupedWhole},${fraction}`;
}
