import type { Tables } from "../lib/database.types";
import { formatSheetQty } from "../stock/qty";

export type SheetItem = Pick<
  Tables<"items">,
  | "id"
  | "name"
  | "name_zh"
  | "unit"
  | "case_size"
  | "record_by_percent"
  | "track_mfg_date"
>;

export type SheetRow = {
  stt: number;
  name: string;
  name_zh: string | null;
  unit: string;
  qty: string;
};

// Bảng ảnh Đơn đặt hàng của một Nhóm: đủ món theo thứ tự tờ, món không đặt để trống (kể cả Nhóm không đặt gì).
export function orderSheetRows(
  items: SheetItem[], // đã xếp thứ tự tờ
  qtyByItem: Map<string, number>
): SheetRow[] {
  return items.map((item, idx) => {
    const qty = qtyByItem.get(item.id);
    return {
      stt: idx + 1,
      name: item.name,
      name_zh: item.name_zh,
      unit: item.unit,
      qty:
        qty === undefined
          ? ""
          : formatSheetQty(qty, {
              caseSize: item.case_size,
              byPercent: item.record_by_percent,
            }),
    };
  });
}

// Ô ảnh Tồn kho dự tính: "<Hàng đang về>+<Tồn thực tế>(<dd/mm Ngày sản xuất gần nhất>)".
// Chỉ món theo dõi Ngày sản xuất mới có ngoặc ngày; không có Hàng đang về thì bỏ phần "+".
export function stockSheetCell(p: {
  incoming: number;
  actual: number;
  lastMfg: string | null; // yyyy-mm-dd
  trackMfg: boolean;
  caseSize: number | null;
  byPercent: boolean;
}): string {
  const opts = { caseSize: p.caseSize, byPercent: p.byPercent };
  const actual = formatSheetQty(p.actual, opts);
  const qty =
    p.incoming > 0 ? `${formatSheetQty(p.incoming, opts)}+${actual}` : actual;
  if (!p.trackMfg || !p.lastMfg) return qty;
  const [, m, d] = p.lastMfg.slice(0, 10).split("-");
  return `${qty}(${d}/${m})`;
}

const MAX_NAMES = 8;

// Danh sách tên Người đặt hàng đã dùng: tên mới nhất lên đầu, không trùng, tối đa 8.
export function rememberOrdererName(names: string[], name: string): string[] {
  const clean = name.trim();
  if (!clean) return names;
  const key = clean.toLowerCase();
  return [clean, ...names.filter((n) => n.toLowerCase() !== key)].slice(
    0,
    MAX_NAMES
  );
}
