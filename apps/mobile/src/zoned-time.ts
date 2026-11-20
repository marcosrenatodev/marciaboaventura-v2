type WallClockParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

export function formatDateInputDraft(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function dateInputToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1000) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isoDateToInput(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

export type ZonedInputResult =
  | { status: "ok"; iso: string }
  | { status: "invalid" }
  | { status: "nonexistent" }
  | { status: "ambiguous" };

function wallClockPartsAt(instantMs: number, timeZone: string): WallClockParts {
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    calendar: "iso8601",
    numberingSystem: "latn",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instantMs));
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(values.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

function isSameMinute(left: WallClockParts, right: WallClockParts): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day
    && left.hour === right.hour && left.minute === right.minute && left.second === 0;
}

export function zonedInstantToInputs(instant: string, timeZone: string): { date: string; time: string } {
  const parts = wallClockPartsAt(Date.parse(instant), timeZone);
  return {
    date: `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${String(parts.year).padStart(4, "0")}`,
    time: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
  };
}

export function zonedInputsToInstant(date: string, time: string, timeZone: string): ZonedInputResult {
  const normalizedDate = dateInputToIso(date);
  const dateMatch = normalizedDate ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizedDate) : null;
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!dateMatch || !timeMatch) return { status: "invalid" };
  const target: WallClockParts = {
    year: Number(dateMatch[1]), month: Number(dateMatch[2]), day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]), minute: Number(timeMatch[2]), second: 0,
  };
  const naiveUtc = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  const normalized = new Date(naiveUtc);
  if (normalized.getUTCFullYear() !== target.year || normalized.getUTCMonth() + 1 !== target.month
    || normalized.getUTCDate() !== target.day || target.year < 1000) return { status: "invalid" };

  const offsets = new Set<number>();
  try {
    for (const hourDelta of [-48, -24, -12, 0, 12, 24, 48]) {
      const sampleMs = naiveUtc + hourDelta * 60 * 60 * 1000;
      const local = wallClockPartsAt(sampleMs, timeZone);
      const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
      offsets.add(localAsUtc - Math.floor(sampleMs / 60_000) * 60_000);
    }
  } catch {
    return { status: "invalid" };
  }

  const matches = [...offsets].map((offset) => naiveUtc - offset)
    .filter((candidate) => isSameMinute(wallClockPartsAt(candidate, timeZone), target));
  if (matches.length === 0) return { status: "nonexistent" };
  if (matches.length > 1) return { status: "ambiguous" };
  return { status: "ok", iso: new Date(matches[0]!).toISOString() };
}
