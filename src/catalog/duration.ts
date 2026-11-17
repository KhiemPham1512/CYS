import type { ShelfLifeUnit } from "../lib/database.types";

export type ParsedDuration = {
  amount: number;
  unit: ShelfLifeUnit;
};

function normalizeSuffix(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase();
}

export function parseDuration(
  raw: string,
  defaultUnit: ShelfLifeUnit
): { ok: true; value: ParsedDuration | null } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };

  const normalized = normalizeSuffix(trimmed);
  const match = /^(\d+)\s*([a-z]*)$/.exec(normalized);
  if (!match) return { ok: false };

  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount <= 0) return { ok: false };

  const suffix = match[2];
  if (!suffix) {
    return { ok: true, value: { amount, unit: defaultUnit } };
  }
  if (suffix === "thang" || suffix === "th" || suffix === "m") {
    return { ok: true, value: { amount, unit: "month" } };
  }
  if (suffix === "ngay" || suffix === "d") {
    return { ok: true, value: { amount, unit: "day" } };
  }
  if (suffix === "nam" || suffix === "y") {
    const months = amount * 12;
    if (!Number.isSafeInteger(months)) return { ok: false };
    return { ok: true, value: { amount: months, unit: "month" } };
  }

  return { ok: false };
}

export function formatDuration(amount: number, unit: ShelfLifeUnit): string {
  return unit === "month" ? `${amount} tháng` : `${amount} ngày`;
}
