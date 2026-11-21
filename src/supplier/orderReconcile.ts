import { normalizeVi } from "../catalog/search";
import { round4 } from "../stock/qty";

export type RawLine = {
  name: string; // "Mứt Cam - 橙醬": tên Việt, có thể kèm tên Trung sau dấu "-"
  qty: number;
  unit: string;
  pack: string | null; // mô tả quy cách, ví dụ "12 lon/thùng"
  orderCode: string | null;
};

export type MatchItem = {
  id: string;
  name: string;
  unit: string;
  case_size: number | null;
};

const vietnamesePart = (name: string) => name.split(" - ")[0];

// Bỏ nội dung trong ngoặc và token khối lượng/dung tích (1kg, 500g, 2l) để so tên ổn định.
function tokens(name: string): string[] {
  return normalizeVi(name.replace(/\([^)]*\)/g, " "))
    .split(/[\s,./-]+/)
    .filter((t) => t && !/^\d+(\.\d+)?(kg|g|l|ml|cc)$/.test(t));
}
const nameKey = (name: string) => tokens(vietnamesePart(name)).join(" ");

// Ảnh chụp màn hình dài thường chồng nhau: dòng đã có ở ảnh trước thì bỏ, không cộng đôi.
// Cùng món khác số lượng giữ cả hai (không đoán). Khác mã đơn là hai dòng khác nhau.
export function mergeRawLines(images: RawLine[][]): RawLine[] {
  const out: RawLine[] = [];
  const seenBefore = new Set<string>();
  let lastCode: string | null = null; // mã đơn thường chỉ hiện ở đầu ảnh đầu; dòng sau thừa hưởng
  for (const image of images) {
    const thisImage: string[] = [];
    for (const raw of image) {
      if (raw.orderCode) lastCode = raw.orderCode;
      const line = { ...raw, orderCode: raw.orderCode ?? lastCode };
      const key = `${line.orderCode ?? ""}|${nameKey(line.name)}|${normalizeVi(line.unit)}|${line.qty}`;
      if (seenBefore.has(key)) continue;
      out.push(line);
      thisImage.push(key);
    }
    for (const k of thisImage) seenBefore.add(k);
  }
  return out;
}

export type NameMatch = { itemId: string; via: "alias" | "exact" | "fuzzy" };

// Khớp tên NCC với món: alias đã nhớ > trùng tên > gần đúng (một món rõ nhất). Không khớp thì null để hỏi.
export function matchSupplierName(
  supplierName: string,
  items: MatchItem[],
  aliases: Record<string, string> // khóa = nameKey, giá trị = id món
): NameMatch | null {
  const key = nameKey(supplierName);
  if (!key) return null;
  const aliased = aliases[key];
  if (aliased && items.some((i) => i.id === aliased))
    return { itemId: aliased, via: "alias" };
  const exact = items.find((i) => tokens(i.name).join(" ") === key);
  if (exact) return { itemId: exact.id, via: "exact" };

  const mine = new Set(key.split(" "));
  const scored = items
    .map((i) => {
      const theirs = new Set(tokens(i.name));
      const inter = [...mine].filter((t) => theirs.has(t)).length;
      const union = new Set([...mine, ...theirs]).size;
      return { id: i.id, score: union === 0 ? 0 : inter / union };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (best && best.score >= 0.5 && (!second || best.score > second.score))
    return { itemId: best.id, via: "fuzzy" };
  return null;
}

const MEASURES = new Set(["l", "ml", "kg", "g", "cc"]);

// "12 lon/thùng" -> 12 lon mỗi thùng. Mô tả kiểu "2L/BÌNH" (dung tích) không phải quy cách đếm được.
export function parsePack(
  desc: string | null
): { per: number; inner: string; outer: string } | null {
  if (!desc) return null;
  const m = /(\d+)\s*([^\d\s/]+)\s*\/\s*([^\d\s/]+)/.exec(normalizeVi(desc));
  if (!m) return null;
  const [, per, inner, outer] = m;
  if (MEASURES.has(inner)) return null;
  return { per: Number(per), inner, outer };
}

// Quy đổi số lượng dòng NCC về đơn vị của món; không chắc thì {ok:false}, không đoán.
export function toItemQty(
  raw: { qty: number; unit: string; pack: string | null },
  item: MatchItem
): { ok: true; qty: number } | { ok: false } {
  const unit = normalizeVi(raw.unit);
  const itemUnit = normalizeVi(item.unit);
  if (unit === itemUnit) return { ok: true, qty: round4(raw.qty) };
  const pack = parsePack(raw.pack);
  if (pack && unit === pack.outer && pack.inner === itemUnit)
    return { ok: true, qty: round4(raw.qty * pack.per) };
  if (unit === "thung" && item.case_size)
    return { ok: true, qty: round4(raw.qty * item.case_size) };
  return { ok: false };
}

export type CompareStatus = "ok" | "less" | "more" | "missing" | "extra";
export type CompareRow = {
  itemId: string;
  ordered: number;
  supplied: number;
  status: CompareStatus;
};

// So số NCC với Đơn đặt hàng (cùng đơn vị món): đúng / NCC ít hơn / NCC nhiều hơn / thiếu món / ngoài đơn.
export function compareOrders(
  ordered: Map<string, number>,
  supplied: Map<string, number>
): { rows: CompareRow[]; allOk: boolean } {
  const ids = new Set([...ordered.keys(), ...supplied.keys()]);
  const rows: CompareRow[] = [];
  for (const itemId of ids) {
    const o = ordered.get(itemId) ?? 0;
    const s = supplied.get(itemId) ?? 0;
    let status: CompareStatus;
    if (o > 0 && s === 0) status = "missing";
    else if (o === 0 && s > 0) status = "extra";
    else if (Math.abs(o - s) < 1e-4) status = "ok";
    else status = s < o ? "less" : "more";
    rows.push({ itemId, ordered: o, supplied: s, status });
  }
  return { rows, allOk: rows.every((r) => r.status === "ok") };
}
