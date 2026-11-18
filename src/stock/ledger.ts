import type { Tables } from "../lib/database.types";

export type Movement = Pick<
  Tables<"stock_movements">,
  "seq" | "item_id" | "kind" | "qty" | "mfg_date" | "expected_qty" | "batch_id"
>;

export type Lot = {
  mfgDate: string | null;
  qty: number;
};

export type CountDiff = {
  item_id: string;
  expected: number;
  actual: number;
  diff: number;
};

function round4(n: number): number {
  const rounded = Math.round(n * 10000) / 10000;
  return rounded === 0 ? 0 : rounded;
}

export function stockLots(movements: Movement[]): Lot[] {
  const sorted = [...movements].sort((a, b) => a.seq - b.seq);
  let unallocated = 0;
  const byMfg = new Map<string, number>();

  for (const m of sorted) {
    if (m.kind === "count" || m.kind === "adjust") {
      byMfg.clear();
      unallocated = m.qty > 0 ? round4(m.qty) : 0;
    } else if (m.kind === "assign_mfg" && m.mfg_date && m.qty > 0) {
      const take = round4(Math.min(m.qty, unallocated));
      if (take > 0) {
        unallocated = round4(unallocated - take);
        byMfg.set(m.mfg_date, round4((byMfg.get(m.mfg_date) ?? 0) + take));
      }
    }
  }

  const lots: Lot[] = [];
  const dates = Array.from(byMfg.keys()).sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0
  );

  for (const mfgDate of dates) {
    const qty = round4(byMfg.get(mfgDate) ?? 0);
    if (qty > 0) {
      lots.push({ mfgDate, qty });
    }
  }

  if (unallocated > 0) {
    lots.push({ mfgDate: null, qty: round4(unallocated) });
  }

  return lots;
}

export function totalQty(lots: Lot[]): number {
  let sum = 0;
  for (const lot of lots) {
    sum += lot.qty;
  }
  return round4(sum);
}

export function stockByItem(movements: Movement[]): Map<string, Lot[]> {
  const grouped = new Map<string, Movement[]>();
  for (const m of movements) {
    const list = grouped.get(m.item_id);
    if (list) {
      list.push(m);
    } else {
      grouped.set(m.item_id, [m]);
    }
  }

  const result = new Map<string, Lot[]>();
  for (const [itemId, list] of grouped.entries()) {
    result.set(itemId, stockLots(list));
  }
  return result;
}

export function countDiffs(
  movements: Movement[],
  batchId: string
): CountDiff[] {
  const sorted = [...movements].sort((a, b) => a.seq - b.seq);
  const diffs: CountDiff[] = [];

  for (const m of sorted) {
    if (
      m.kind === "count" &&
      m.batch_id === batchId &&
      m.expected_qty !== null
    ) {
      const diff = round4(m.qty - m.expected_qty);
      if (diff !== 0) {
        diffs.push({
          item_id: m.item_id,
          expected: m.expected_qty,
          actual: m.qty,
          diff,
        });
      }
    }
  }

  return diffs;
}
