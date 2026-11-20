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

// Ô ảnh Tồn kho dự tính: "<Hàng đang về>+<Tồn thực tế>(<ngày trong tháng của Ngày sản xuất gần nhất>)".
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
  const day = Number(p.lastMfg.slice(8, 10)); // tờ giấy chỉ ghi ngày trong tháng: 6+3(15)
  return `${qty}(${day})`;
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

// Dữ liệu "in trên tờ" của món (cột items.sheet); rỗng thì dùng tên/đơn vị trong app.
export type ItemSheet = {
  name?: string;
  zh?: string;
  unit?: string;
  unit_zh?: string;
  note?: string;
  category?: string;
  category_zh?: string;
};
export type ModelItem = {
  id: string;
  name: string;
  unit: string;
  sheet: ItemSheet;
};

export type SheetModel = {
  title: string;
  titleZh: string;
  qtyLabel: string;
  rows: {
    stt: number;
    name: string;
    zh: string;
    note: string;
    unit: string;
    unitZh: string;
    qty: string;
  }[];
  categories: { label: string; labelZh: string; span: number }[];
};

// Dựng nội dung tờ giấy giống mẫu: tiêu đề, bảng (STT, LOẠI gộp ô, tên + chữ Trung, đơn vị 2 dòng, số lượng)
// Mọi chữ riêng của quán đọc từ DB, không nằm trong mã.
export function buildSheetModel(p: {
  kind: "order" | "stock";
  branch: {
    name: string;
    sheet: { title?: string; order_zh?: string; stock_zh?: string };
  };
  group: {
    name: string;
    name_zh: string | null;
    sheet: { qty_label?: string; label?: string; label_zh?: string };
  };
  items: ModelItem[];
  qtyByItem: Map<string, string>;
}): SheetModel {
  const branchTitle = p.branch.sheet.title ?? p.branch.name.toUpperCase();
  const lead = p.kind === "order" ? "ĐẶT HÀNG" : "TỒN KHO MỖI NGÀY";
  const titleZh =
    (p.kind === "order" ? p.branch.sheet.order_zh : p.branch.sheet.stock_zh) ??
    "";

  const groupLabel = p.group.sheet.label ?? p.group.name.toUpperCase();
  const groupLabelZh = p.group.sheet.label_zh ?? p.group.name_zh ?? "";

  const rows: SheetModel["rows"] = [];
  const categories: SheetModel["categories"] = [];
  for (const item of p.items) {
    const qty = p.qtyByItem.get(item.id) ?? "";
    rows.push({
      stt: rows.length + 1,
      name: item.sheet.name ?? item.name,
      zh: item.sheet.zh ?? "",
      note: item.sheet.note ?? "",
      unit: item.sheet.unit ?? item.unit,
      unitZh: item.sheet.unit_zh ?? "",
      qty,
    });
    const label = item.sheet.category ?? groupLabel;
    const labelZh = item.sheet.category_zh ?? groupLabelZh;
    const last = categories[categories.length - 1];
    if (last && last.label === label && last.labelZh === labelZh) last.span++;
    else categories.push({ label, labelZh, span: 1 });
  }
  return {
    title: `${lead} - ${branchTitle}`,
    titleZh,
    qtyLabel: p.group.sheet.qty_label ?? "SỐ LƯỢNG",
    rows,
    categories,
  };
}

// Đọc cột JSON "in trên tờ": chỉ giữ các khóa cho phép có giá trị chuỗi (dữ liệu lạ bị bỏ, không làm hỏng ảnh).
export function sheetStrings<K extends string>(
  json: unknown,
  keys: readonly K[]
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  if (typeof json !== "object" || json === null || Array.isArray(json))
    return out;
  const obj = json as Record<string, unknown>;
  for (const k of keys)
    if (typeof obj[k] === "string" && obj[k] !== "") out[k] = obj[k] as string;
  return out;
}
