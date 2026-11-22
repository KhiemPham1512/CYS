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
        qty === undefined || qty <= 0
          ? ""
          : formatSheetQty(qty, {
              caseSize: item.case_size,
              byPercent: item.record_by_percent,
            }),
    };
  });
}

// Ô ảnh Tồn kho dự tính, viết như tờ giấy:
// - món không theo dõi Ngày sản xuất: "<Hàng đang về>+<Tồn thực tế>" (12+2);
// - món theo dõi Ngày sản xuất: mỗi cụm "số(ngày trong tháng)" cách bằng dấu cách, hàng đang về chưa có ngày ghi "()",
//   các lô tồn theo Ngày sản xuất cũ trước (6() 4(21), 3(2) 3(3)); tồn chưa có ngày cũng ghi "()".
// Hết sạch thì "0", trừ món/Nhóm có cờ blank_zero trong dữ liệu in thì để trống.
export function stockSheetCell(p: {
  incoming: number;
  lots: { qty: number; mfgDate: string | null }[]; // lô tồn thực tế (stockByItem)
  trackMfg: boolean;
  caseSize: number | null;
  byPercent: boolean;
  blankZero?: boolean;
}): string {
  const opts = { caseSize: p.caseSize, byPercent: p.byPercent };
  const fmt = (qty: number) => formatSheetQty(qty, opts);
  const stock = p.lots.filter((l) => l.qty > 0);
  let out: string;
  if (p.trackMfg) {
    const undated = stock.reduce((n, l) => (l.mfgDate ? n : n + l.qty), 0);
    const dated = stock
      .filter((l) => l.mfgDate)
      .sort((a, b) => (a.mfgDate ?? "").localeCompare(b.mfgDate ?? ""));
    out = [
      p.incoming > 0 ? `${fmt(p.incoming)}()` : "",
      undated > 0 ? `${fmt(undated)}()` : "",
      ...dated.map((l) => `${fmt(l.qty)}(${Number(l.mfgDate?.slice(8, 10))})`), // tờ giấy chỉ ghi ngày trong tháng
    ]
      .filter(Boolean)
      .join(" ");
  } else {
    const actual = stock.reduce((n, l) => n + l.qty, 0);
    out = [p.incoming > 0 ? fmt(p.incoming) : "", actual > 0 ? fmt(actual) : ""]
      .filter(Boolean)
      .join("+");
  }
  return out || (p.blankZero ? "" : "0");
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
  qty_suffix?: string; // chữ viết kèm số lượng trong ô (vd. "Sấp" → "1 Sấp"), như viết tay trên tờ
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
    const raw = p.qtyByItem.get(item.id) ?? "";
    const qty =
      item.sheet.qty_suffix && raw !== "" && raw !== "0"
        ? `${raw} ${item.sheet.qty_suffix}`
        : raw;
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

// Dựng mẫu tờ từ dữ liệu thô của DB (cột JSON "in trên tờ" của Chi nhánh/Nhóm/món): dùng chung cho Xuất ảnh và Đơn đang đặt.
export function sheetModelFor(p: {
  kind: "order" | "stock";
  branchName: string;
  branchSheet: unknown;
  group: { name: string; name_zh: string | null; sheet: unknown };
  items: { id: string; name: string; unit: string; sheet: unknown }[];
  qtyByItem: Map<string, string>;
}): SheetModel {
  return buildSheetModel({
    kind: p.kind,
    branch: {
      name: p.branchName,
      sheet: sheetStrings(p.branchSheet, ["title", "order_zh", "stock_zh"]),
    },
    group: {
      name: p.group.name,
      name_zh: p.group.name_zh,
      sheet: sheetStrings(p.group.sheet, ["qty_label", "label", "label_zh"]),
    },
    items: p.items.map((i) => ({
      id: i.id,
      name: i.name,
      unit: i.unit,
      sheet: sheetStrings(i.sheet, [
        "name",
        "zh",
        "unit",
        "unit_zh",
        "qty_suffix",
        "note",
        "category",
        "category_zh",
      ]) satisfies ItemSheet,
    })),
    qtyByItem: p.qtyByItem,
  });
}

// Cờ "để trống khi 0" ở ảnh Tồn kho, đặt trong dữ liệu in của Nhóm hoặc món (blank_zero).
export const blankZero = (groupSheet: unknown, itemSheet: unknown): boolean =>
  !!sheetStrings(groupSheet, ["blank_zero"]).blank_zero ||
  !!sheetStrings(itemSheet, ["blank_zero"]).blank_zero;
