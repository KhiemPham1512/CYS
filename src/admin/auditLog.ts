import { VN_OFFSET_MS } from "../stock/ledger";
export type AuditEntry = {
  table_name: string; // items | item_groups | branch_settings | members | stock_movements
  action: string; // insert | update | delete, hoặc loại biến động kho (use, count, ...)
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

const YES_NO = (v: unknown) => (v ? "Có" : "Không");
const DASH = "—";
const UNIT_VI: Record<string, string> = { day: "ngày", month: "tháng" };

// Nhãn tiếng Việt cho từng trường theo bảng; trường không có trong đây (updated_at, id...) bị bỏ qua.
const FIELDS: Record<string, Record<string, string>> = {
  items: {
    name: "Tên",
    name_zh: "Tên tiếng Trung",
    unit: "Đơn vị",
    unit_zh: "Đơn vị tiếng Trung",
    case_size: "Quy cách thùng",
    track_mfg_date: "Theo dõi Ngày sản xuất",
    shelf_life_from_receipt_days: "Hạn từ ngày nhập (ngày)",
    record_by_percent: "Ghi theo %",
    skip_count: "Không cần kiểm kho",
    is_hidden: "Ẩn",
  },
  item_groups: { name: "Tên Nhóm", name_zh: "Tên Nhóm tiếng Trung" },
  branch_settings: { branch_name: "Tên Chi nhánh" },
  members: { is_admin: "Quyền Quản trị", is_locked: "Khóa tài khoản" },
};
const BOOLEAN_FIELDS = new Set([
  "track_mfg_date",
  "record_by_percent",
  "skip_count",
  "is_hidden",
  "is_admin",
  "is_locked",
]);

const show = (v: unknown) =>
  v === null || v === undefined || v === "" ? DASH : String(v);

const duration = (
  data: Record<string, unknown>,
  key: string,
  unitKey: string
) =>
  data[key] === null || data[key] === undefined
    ? DASH
    : `${data[key]} ${UNIT_VI[String(data[unitKey])] ?? ""}`.trim();

const SUBJECT: Record<string, string> = {
  members: "tài khoản",
  branch_settings: "Cài đặt Chi nhánh",
};

const STOCK_LABEL: Record<string, string> = {
  use: "Ghi dùng",
  count: "Kiểm kho",
  adjust: "Điều chỉnh",
  assign_mfg: "Thêm Ngày sản xuất",
  receive: "Nhận hàng",
  return_damaged: "Trả hàng hư",
  void: "Hủy Ghi dùng",
};

function formatVnDateTime(iso: unknown): string {
  const ms = typeof iso === "string" ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(ms)) return show(iso);
  const s = new Date(ms + VN_OFFSET_MS).toISOString();
  return `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;
}

// Mô tả một dòng Nhật ký thành các câu "Nhãn: cũ → mới"; trường không đổi thì bỏ.
export function describeChange(e: AuditEntry): string[] {
  if (e.table_name === "stock_movements") {
    if (e.action === "void" && e.new_data?.note === "rollback") {
      return ["Quay lại sổ kho: hủy 1 dòng"];
    }
    const qty = e.new_data?.qty;
    const label = STOCK_LABEL[e.action] ?? e.action;
    const expected = e.new_data?.expected_qty;
    const tail =
      expected !== undefined && expected !== null ? ` (sổ ${expected})` : "";
    return [`${label}: ${show(qty)}${tail}`];
  }
  if (e.table_name === "stock_rollback") {
    if (e.action === "delete") {
      return [`Khôi phục lần quay lại: ${show(e.old_data?.count)} dòng`];
    }
    return [
      `Quay lại sổ kho từ ${formatVnDateTime(e.new_data?.since)}: ${show(e.new_data?.count)} dòng`,
    ];
  }
  if (e.table_name === "purchase_order_lines" && e.action === "delete") {
    return [`Xóa khỏi đơn đã đặt: ${show(e.old_data?.qty)}`];
  }
  if (e.table_name === "branch_reset") {
    return ["Xóa dữ liệu phát sinh của Chi nhánh"];
  }
  const name = String((e.new_data ?? e.old_data)?.name ?? "");
  const subject = name || SUBJECT[e.table_name] || e.table_name;
  if (e.action === "insert") return [`Thêm: ${subject}`];
  if (e.action === "delete") return [`Xóa: ${subject}`];

  const oldD = e.old_data ?? {};
  const newD = e.new_data ?? {};
  const lines: string[] = [];
  const labels = FIELDS[e.table_name] ?? {};
  const same = (k: string) => oldD[k] === newD[k];

  for (const [key, label] of Object.entries(labels)) {
    if (same(key)) continue;
    const f = (d: Record<string, unknown>) =>
      BOOLEAN_FIELDS.has(key) ? YES_NO(d[key]) : show(d[key]);
    lines.push(`${label}: ${f(oldD)} → ${f(newD)}`);
  }
  // Dữ liệu in trên tờ (Xuất ảnh): chỉ báo đã đổi, không liệt kê nội dung.
  if (
    "sheet" in newD &&
    JSON.stringify(oldD.sheet) !== JSON.stringify(newD.sheet)
  )
    lines.push("Dữ liệu in trên tờ: đã đổi");
  if (e.table_name === "items") {
    if (!same("shelf_life") || !same("shelf_life_unit"))
      lines.push(
        `Thời hạn: ${duration(oldD, "shelf_life", "shelf_life_unit")} → ${duration(newD, "shelf_life", "shelf_life_unit")}`
      );
    if (!same("shelf_life_after_open") || !same("shelf_life_after_open_unit"))
      lines.push(
        `Hạn sau khui: ${duration(oldD, "shelf_life_after_open", "shelf_life_after_open_unit")} → ${duration(newD, "shelf_life_after_open", "shelf_life_after_open_unit")}`
      );
  }
  return lines;
}
