import { expiredLots, type ExpiryItem } from "./expiry";
import type { Lot } from "./ledger";

export type SummaryItem = ExpiryItem & { id: string; skip_count?: boolean };
export type StockFlag = "unchecked" | "expired" | "incoming";

// Tóm tắt đầu màn Tồn kho: món nào Chưa kiểm, có Lô Quá hạn, đang có Hàng đang về.
export function stockSummary(input: {
  items: SummaryItem[];
  lotsByItem: Map<string, Lot[]>;
  checked: Set<string>;
  incoming: Map<string, number>;
  today: string;
}) {
  const ids: Record<StockFlag, Set<string>> = {
    unchecked: new Set(),
    expired: new Set(),
    incoming: new Set(),
  };
  for (const item of input.items) {
    if (!item.skip_count && !input.checked.has(item.id))
      ids.unchecked.add(item.id);
    if (
      expiredLots(input.lotsByItem.get(item.id) ?? [], item, input.today)
        .length > 0
    )
      ids.expired.add(item.id);
    if ((input.incoming.get(item.id) ?? 0) > 0) ids.incoming.add(item.id);
  }
  return {
    ids,
    counts: {
      unchecked: ids.unchecked.size,
      expired: ids.expired.size,
      incoming: ids.incoming.size,
    },
  };
}

// Bấm chip để chỉ giữ các món thuộc loại đó; không chọn (null) thì giữ nguyên.
export function filterByFlag<T extends { id: string }>(
  items: T[],
  summary: ReturnType<typeof stockSummary>,
  flag: StockFlag | null
): T[] {
  return flag ? items.filter((i) => summary.ids[flag].has(i.id)) : items;
}
