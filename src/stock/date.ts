export type ParseDateResult =
  { ok: true; value: string } | { ok: false; error: string };

function isValidDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const dt = new Date(year, month - 1, day);
  return (
    dt.getFullYear() === year &&
    dt.getMonth() === month - 1 &&
    dt.getDate() === day
  );
}

function toIsoDate(year: number, month: number, day: number): string {
  const y = String(year).padStart(4, "0");
  const m = String(month).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isAfterToday(
  year: number,
  month: number,
  day: number,
  todayYear: number,
  todayMonth: number,
  todayDay: number
): boolean {
  if (year !== todayYear) return year > todayYear;
  if (month !== todayMonth) return month > todayMonth;
  return day > todayDay;
}

export function parseShortDate(input: string, today: Date): ParseDateResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, error: "Chưa nhập ngày" };
  }

  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  const todayDay = today.getDate();

  const parts = trimmed.split("/");
  if (parts.length === 1) {
    if (!/^\d{1,2}$/.test(parts[0])) {
      return { ok: false, error: "Ngày không hợp lệ" };
    }
    const day = Number(parts[0]);
    if (day < 1 || day > 31) {
      return { ok: false, error: "Ngày không hợp lệ" };
    }

    let y = todayYear;
    let m = todayMonth;
    if (day > todayDay || !isValidDate(y, m, day)) {
      for (let i = 0; i < 12; i++) {
        m -= 1;
        if (m < 1) {
          m = 12;
          y -= 1;
        }
        if (isValidDate(y, m, day)) {
          break;
        }
      }
    }

    return { ok: true, value: toIsoDate(y, m, day) };
  }

  if (parts.length === 2) {
    if (!/^\d{1,2}$/.test(parts[0]) || !/^\d{1,2}$/.test(parts[1])) {
      return { ok: false, error: "Ngày không hợp lệ" };
    }
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year = isAfterToday(
      todayYear,
      month,
      day,
      todayYear,
      todayMonth,
      todayDay
    )
      ? todayYear - 1
      : todayYear;

    if (!isValidDate(year, month, day)) {
      return { ok: false, error: "Ngày không hợp lệ" };
    }
    return { ok: true, value: toIsoDate(year, month, day) };
  }

  if (parts.length === 3) {
    if (
      !/^\d{1,2}$/.test(parts[0]) ||
      !/^\d{1,2}$/.test(parts[1]) ||
      !/^(\d{2}|\d{4})$/.test(parts[2])
    ) {
      return { ok: false, error: "Ngày không hợp lệ" };
    }
    const day = Number(parts[0]);
    const month = Number(parts[1]);
    const year =
      parts[2].length === 2 ? 2000 + Number(parts[2]) : Number(parts[2]);

    if (!isValidDate(year, month, day)) {
      return { ok: false, error: "Ngày không hợp lệ" };
    }
    if (isAfterToday(year, month, day, todayYear, todayMonth, todayDay)) {
      return { ok: false, error: "Ngày sản xuất không thể ở tương lai" };
    }
    return { ok: true, value: toIsoDate(year, month, day) };
  }

  return { ok: false, error: "Ngày không hợp lệ" };
}

export function formatDate(iso: string): string {
  const parts = iso.slice(0, 10).split("-");
  if (parts.length !== 3) return iso;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}
