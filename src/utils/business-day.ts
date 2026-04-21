function formatDateParts(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getTodayDateString(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>;

  return `${values.year}-${values.month}-${values.day}`;
}

function parseDateInput(dateInput: string | undefined, timeZone = "UTC") {
  const value = dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)
    ? dateInput
    : getTodayDateString(timeZone);
  const [year, month, day] = value.split("-").map(Number);

  return { value, year, month, day };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  ) as Record<string, number>;

  const asUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second);
  return asUtc - date.getTime();
}

function addDays(dateString: string, deltaDays: number) {
  const { year, month, day } = parseDateInput(dateString);
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function getBusinessDayRange(dateInput: string | undefined, timeZone: string) {
  const parsed = parseDateInput(dateInput, timeZone);
  const utcGuess = new Date(Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0));
  const startOffset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const start = new Date(utcGuess.getTime() - startOffset);

  const nextDate = addDays(parsed.value, 1);
  const nextParsed = parseDateInput(nextDate);
  const nextUtcGuess = new Date(Date.UTC(nextParsed.year, nextParsed.month - 1, nextParsed.day, 0, 0, 0));
  const nextOffset = getTimeZoneOffsetMs(nextUtcGuess, timeZone);
  const nextStart = new Date(nextUtcGuess.getTime() - nextOffset);

  return {
    date: parsed.value,
    start,
    end: new Date(nextStart.getTime() - 1)
  };
}
