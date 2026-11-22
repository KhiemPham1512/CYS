import { round4 } from "../stock/qty";
import {
  compareOrders,
  matchSupplierName,
  mergeRawLines,
  toItemQty,
  type CompareRow,
  type MatchItem,
  type RawLine,
} from "./orderReconcile";

export type SupplierReview = {
  rows: CompareRow[];
  unknown: RawLine[]; // tên chưa khớp món nào: hỏi người dùng rồi nhớ (supplier_aliases)
  matched: { line: RawLine; itemId: string; via: "alias" | "fuzzy" }[]; // khớp nhờ tên đã nhớ/đoán: để người dùng sửa nếu nhầm
  unconvertible: { line: RawLine; itemId: string }[]; // khớp món nhưng không quy đổi được đơn vị
  allOk: boolean;
};

// Từ các ảnh đã đọc đến bảng so sánh với đơn đã đặt của Nhóm. Không đụng DB, không sửa đơn.
export function reviewSupplierOrder(input: {
  images: RawLine[][];
  items: MatchItem[];
  aliases: Record<string, string>;
  ordered: Map<string, number>;
}): SupplierReview {
  const byId = new Map(input.items.map((i) => [i.id, i]));
  const supplied = new Map<string, number>();
  const unknown: RawLine[] = [];
  const unconvertible: SupplierReview["unconvertible"] = [];
  const matched: SupplierReview["matched"] = [];

  for (const line of mergeRawLines(input.images)) {
    const match = matchSupplierName(line.name, input.items, input.aliases);
    const item = match && byId.get(match.itemId);
    if (!match || !item) {
      unknown.push(line);
      continue;
    }
    if (match.via === "alias" || match.via === "fuzzy")
      matched.push({ line, itemId: item.id, via: match.via });
    const qty = toItemQty(line, item);
    if (!qty.ok) {
      unconvertible.push({ line, itemId: item.id });
      continue;
    }
    supplied.set(item.id, round4((supplied.get(item.id) ?? 0) + qty.qty));
  }

  const { rows, allOk } = compareOrders(input.ordered, supplied);
  return {
    rows,
    unknown,
    matched,
    unconvertible,
    allOk: allOk && unknown.length === 0 && unconvertible.length === 0,
  };
}
