import type { ShelfLifeUnit, Tables } from "../lib/database.types";
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

// Ngày cuối còn dùng được: hạn tính cả ngày bắt đầu, nên "30 ngày" từ 18/11 là hết ngày 17/12.
// Hạn theo tháng giữ nguyên quy tắc lịch (15/10 + 6 tháng = 15/04).
export function lastDay(
  iso: string,
  amount: number,
  unit: "day" | "month"
): string {
  return unit === "day"
    ? addDuration(iso, amount - 1, "day")
    : addDuration(iso, amount, "month");
}

// Hạn của Lô = ngày sớm hơn giữa "Ngày sản xuất + Thời hạn sử dụng" và "ngày vào kho + hạn từ ngày nhập".
// shortcut: Lô có Ngày sản xuất không biết ngày vào kho (sổ chỉ giữ ngày vào kho cho phần chưa có ngày),
// nên quy tắc "từ ngày nhập" chỉ áp khi Lô có enteredOn.
export function lotExpiry(lot: Lot, item: ExpiryItem): string | null {
  const candidates: string[] = [];
  if (lot.mfgDate && item.shelf_life)
    candidates.push(
      lastDay(lot.mfgDate, item.shelf_life, item.shelf_life_unit)
    );
  if (lot.enteredOn && item.shelf_life_from_receipt_days)
    candidates.push(
      lastDay(lot.enteredOn, item.shelf_life_from_receipt_days, "day")
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

// "28/10" (bỏ năm).
export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}`;
}

// Ngày sản xuất viết tắt "28/10"; chỉ giữ năm khi hạn dùng sang năm khác (món hạn dài).
export function formatMfg(mfgDate: string, item: ExpiryItem): string {
  const expiry = item.shelf_life
    ? lastDay(mfgDate, item.shelf_life, item.shelf_life_unit)
    : null;
  const short = formatDayMonth(mfgDate);
  return expiry && expiry.slice(0, 4) !== mfgDate.slice(0, 4)
    ? `${short}/${mfgDate.slice(0, 4)}`
    : short;
}

// Món có Ngày sản xuất trên giao diện: món theo dõi hoặc có Thời hạn sử dụng. Món không hạn (nhóm Đóng gói) thì ẩn.
export function usesMfgDate(
  item: Pick<Tables<"items">, "track_mfg_date" | "shelf_life">
): boolean {
  return item.track_mfg_date || item.shelf_life !== null;
}

// Các Lô của một món đã quá hạn (hạn trước hôm nay).
export function expiredLots(
  lots: Lot[],
  item: ExpiryItem,
  today: string
): Lot[] {
  return lots.filter((l) => {
    const expiry = lotExpiry(l, item);
    return expiry !== null && expiry < today;
  });
}

// Quy tắc tự động: chỉ món có hạn sau khui dài (> 7 ngày; tháng luôn dài hơn) mới vào Đang dùng.
// shortcut: mốc 7 ngày cố định theo ticket #10; Quản trị có thể ghi đè từng món bằng track_in_use.
export function autoTracksInUse(
  after: number | null,
  unit: ShelfLifeUnit
): boolean {
  return Boolean(after && (unit === "month" || after > 7));
}

// Món vào Đang dùng khi có hạn sau khui và (track_in_use bật, hoặc để null thì theo quy tắc tự động).
export function tracksInUse(
  item: ExpiryItem & { track_in_use?: boolean | null }
): boolean {
  if (!item.shelf_life_after_open) return false;
  return (
    item.track_in_use ??
    autoTracksInUse(item.shelf_life_after_open, item.shelf_life_after_open_unit)
  );
}

export function inUseExpiry(openedOn: string, item: ExpiryItem): string | null {
  return item.shelf_life_after_open
    ? lastDay(
        openedOn,
        item.shelf_life_after_open,
        item.shelf_life_after_open_unit
      )
    : null;
}

// Kiểm kho đếm ít hơn sổ = đã dùng: món có hạn sau khui dài vào Đang dùng (như Ghi dùng, mỗi món một đơn vị).
export function openedByCount(
  rows: { item_id: string; qty: number; expected_qty: number }[],
  items: Map<string, ExpiryItem & { track_in_use?: boolean | null }>
): string[] {
  return rows
    .filter((r) => r.qty < r.expected_qty)
    .map((r) => r.item_id)
    .filter((id) => {
      const it = items.get(id);
      return it ? tracksInUse(it) : false;
    });
}
