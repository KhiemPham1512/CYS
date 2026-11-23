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
  alt_name?: string | null; // tên in trên tờ đặt hàng (items.sheet.name), thường gần tên NCC hơn tên trong app
  name_zh?: string | null; // tên tiếng Trung của món (nếu đã nhập), dùng để khớp với tên Trung trên đơn NCC
};

const vietnamesePart = (name: string) => name.split(" - ")[0];

// Bỏ ngoặc có số (dung tích/khối lượng như "(960cc)", "(200g)") và token khối lượng (1kg, 500g, 2l) để so tên ổn định;
// ngoặc chỉ có chữ như "(không đường)" là phần phân biệt món nên giữ lại.
function tokens(name: string): string[] {
  return normalizeVi(
    name.replace(/\([^)]*\d[^)]*\)/g, " ").replace(/[()]/g, " ")
  )
    .split(/[\s,./-]+/)
    .filter((t) => t && !/^\d+(\.\d+)?(kg|g|l|ml|cc)$/.test(t));
}
const namesOf = (i: MatchItem): string[] =>
  i.alt_name && i.alt_name !== i.name ? [i.name, i.alt_name] : [i.name];
export const nameKey = (name: string) => tokens(vietnamesePart(name)).join(" ");

// sizeTags: khối lượng/dung tích trong ngoặc của phần tên Việt; "(960 cc)" = "(960cc)", "(1,5l)" = "1.5l".
export const sizeTags = (name: string): string[] =>
  [...vietnamesePart(name).matchAll(/\(([^)]*)\)/g)].flatMap((paren) =>
    [
      ...normalizeVi(paren[1]).matchAll(
        /(\d+(?:[.,]\d+)?)\s*(kg|g|l|ml|cc)\b/g
      ),
    ].map((m) => `${m[1].replace(",", ".")}${m[2]}`)
  );

// Khóa nhớ tên và gộp dòng: như nameKey nhưng giữ khối lượng/dung tích trong ngoặc, vì "(960cc)" và "(700cc)" là hai món khác nhau.
export const aliasKey = (name: string) =>
  [nameKey(name), ...sizeTags(name)].filter(Boolean).join(" ");

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
      const key = `${line.orderCode ?? ""}|${aliasKey(line.name)}|${normalizeVi(line.unit)}|${line.qty}`;
      if (seenBefore.has(key)) continue;
      out.push(line);
      thisImage.push(key);
    }
    for (const k of thisImage) seenBefore.add(k);
  }
  return out;
}

// shortcut: bảng đổi giản thể → phồn thể chỉ gồm các chữ hay gặp trên đơn đồ uống; chữ ngoài bảng thì khác nhau coi là khác, khi đó hỏi tay.
const SIMPLE_TO_TRAD: Record<string, string> = Object.fromEntries(
  "无無 马馬 圆圓 红紅 绿綠 鲜鮮 乌烏 龙龍 柠檸 乐樂 爱愛 冻凍 汤湯 饮飲 湾灣 浆漿 种種 双雙 气氣 麦麥 谷穀 绵綿 莲蓮 药藥 开開 对對 顶頂 级級 线線 纸紙 机機 号號"
    .split(" ")
    .map((p) => [...p] as [string, string])
);
const HAN = /[㐀-鿿]/;
// Phần tiếng Trung của tên NCC (sau " - ", hoặc cả tên nếu chỉ có chữ Trung) → khóa so sánh: chữ Hán phồn thể + số kèm theo.
function zhKey(name: string): string | null {
  const part = name.includes(" - ")
    ? name.slice(name.indexOf(" - ") + 3)
    : name;
  const chars = [...part].map((c) => SIMPLE_TO_TRAD[c] ?? c);
  const han = chars.filter((c) => HAN.test(c));
  if (han.length < 2) return null;
  // Giữ cả số kèm theo (700, 5...): "珍珠 5" khác "珍珠".
  return chars.filter((c) => HAN.test(c) || /\d/.test(c)).join("");
}

export type NameMatch = {
  itemId: string;
  via: "alias" | "exact" | "zh" | "fuzzy";
};

// Khớp tên NCC với món: alias đã nhớ > trùng tên > gần đúng (một món rõ nhất). Không khớp thì null để hỏi.
export function matchSupplierName(
  supplierName: string,
  items: MatchItem[],
  aliases: Record<string, string> // khóa = aliasKey, giá trị = id món
): NameMatch | null {
  const key = nameKey(supplierName);
  const alias = aliasKey(supplierName);
  const zh = zhKey(supplierName);
  if (!key && !zh) return null;
  const aliased = alias ? aliases[alias] : undefined;
  if (aliased && items.some((i) => i.id === aliased))
    return { itemId: aliased, via: "alias" };
  const exact = key
    ? items.filter((i) => namesOf(i).some((n) => tokens(n).join(" ") === key))
    : [];
  if (exact.length === 1) return { itemId: exact[0].id, via: "exact" };
  if (exact.length > 1) return null; // nhiều món cùng khóa tên (vd khác khối lượng): hỏi, không đoán

  if (zh) {
    // Trùng tên Trung (kể cả số) và chỉ một món như vậy thì khớp; trùng nhiều món thì không đoán.
    const same = items.filter((i) => i.name_zh && zhKey(i.name_zh) === zh);
    if (same.length === 1) return { itemId: same[0].id, via: "zh" };
    if (same.length > 1) return null;
  }
  if (!key) return null;

  const mine = new Set(key.split(" "));
  const scored = items
    .map((i) => {
      const score = Math.max(
        ...namesOf(i).map((n) => {
          const theirs = new Set(tokens(n));
          const inter = [...mine].filter((t) => theirs.has(t)).length;
          const union = new Set([...mine, ...theirs]).size;
          return union === 0 ? 0 : inter / union;
        })
      );
      return { id: i.id, score };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  if (best && best.score >= 0.5 && (!second || best.score > second.score))
    return { itemId: best.id, via: "fuzzy" };
  return null;
}

const MEASURES = new Set(["l", "ml", "kg", "g", "cc"]);
// shortcut: danh sách đơn vị lẻ viết tay, không dấu; nâng cấp (lấy từ dữ liệu) khi gặp đơn vị lẻ mới bị báo "không quy đổi được".
const RETAIL_UNITS = new Set([
  "hop",
  "lon",
  "goi",
  "chai",
  "binh",
  "bao",
  "tui",
  "hu",
  "cai",
]);

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
  // NCC ghi đơn vị lẻ khác tên ("5 Hộp") nhưng mô tả quy cách cho thấy là chính món lẻ ("12 lon/thùng"): coi là cùng đơn vị.
  // Chỉ với đơn vị lẻ đã biết; "Lốc", "Kiện"... là bao ngoài nên không đoán.
  if (pack && pack.inner === itemUnit && RETAIL_UNITS.has(unit))
    return { ok: true, qty: round4(raw.qty) };
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

// Tối đa 3 món gần nhất với tên lạ (theo từ chung) để người dùng chạm một lần thay vì lục cả danh sách.
export function suggestItems(
  supplierName: string,
  items: MatchItem[],
  limit = 3
): MatchItem[] {
  const mine = new Set(tokens(vietnamesePart(supplierName)));
  return items
    .map((item) => {
      const inter = Math.max(
        ...namesOf(item).map((n) => tokens(n).filter((t) => mine.has(t)).length)
      );
      return { item, inter };
    })
    .filter((x) => x.inter > 0)
    .sort((a, b) => b.inter - a.inter)
    .slice(0, limit)
    .map((x) => x.item);
}
