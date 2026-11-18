import type { Tables } from "../lib/database.types";
import type { Lot } from "./ledger";

export type ExpiryItem = Pick<
  Tables<"items">,
  | "shelf_life"
  | "shelf_life_unit"
  | "shelf_life_from_receipt_days"
  | "shelf_life_after_open"
  | "shelf_life_after_open_unit"
>;

const DAY_MS = 86_400_000;
const toUtc = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Cộng ngày, hoặc tháng theo lịch (ngày 31 + 1 tháng = ngày cuối của tháng đích).
export function addDuration(
  iso: string,
  amount: number,
  unit: "day" | "month"
): string {
  if (unit === "day") return toIso(toUtc(iso) + amount * DAY_MS);
  const d = new Date(toUtc(iso));
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + amount);
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)
  ).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

// Hạn của Lô = ngày sớm hơn giữa "Ngày sản xuất + Thời hạn sử dụng" và "ngày vào kho + hạn từ ngày nhập".
// shortcut: Lô có Ngày sản xuất không biết ngày vào kho (sổ chỉ giữ ngày vào kho cho phần chưa có ngày),
// nên quy tắc "từ ngày nhập" chỉ áp khi Lô có enteredOn.
export function lotExpiry(lot: Lot, item: ExpiryItem): string | null {
  const candidates: string[] = [];
  if (lot.mfgDate && item.shelf_life)
    candidates.push(
      addDuration(lot.mfgDate, item.shelf_life, item.shelf_life_unit)
    );
  if (lot.enteredOn && item.shelf_life_from_receipt_days)
    candidates.push(
      addDuration(lot.enteredOn, item.shelf_life_from_receipt_days, "day")
    );
  return candidates.sort()[0] ?? null;
}

// Quá hạn: hạn trước hôm nay. Sắp hết: còn 0..threshold ngày. Cả hai xếp theo hạn gần nhất trước.
export function expiryAlerts<T extends { expiry: string }>(
  rows: T[],
  today: string,
  threshold: number
): { expired: T[]; soon: T[] } {
  const limit = addDuration(today, threshold, "day");
  const byExpiry = (a: T, b: T) => a.expiry.localeCompare(b.expiry);
  return {
    expired: rows.filter((r) => r.expiry < today).sort(byExpiry),
    soon: rows
      .filter((r) => r.expiry >= today && r.expiry <= limit)
      .sort(byExpiry),
  };
}

// Chỉ món có hạn sau khui dài (> 7 ngày; tháng luôn dài hơn) mới vào Đang dùng.
export function tracksInUse(item: ExpiryItem): boolean {
  const n = item.shelf_life_after_open;
  if (!n) return false;
  return item.shelf_life_after_open_unit === "month" || n > 7;
}

export function inUseExpiry(openedOn: string, item: ExpiryItem): string | null {
  return item.shelf_life_after_open
    ? addDuration(
        openedOn,
        item.shelf_life_after_open,
        item.shelf_life_after_open_unit
      )
    : null;
}
