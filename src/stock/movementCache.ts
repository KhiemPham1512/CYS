import type { Tables } from "../lib/database.types";

type Row = Tables<"stock_movements">;
export type MovementCache = { rows: Row[]; maxSeq: number };

const EMPTY: MovementCache = { rows: [], maxSeq: 0 };

const lastSeq = (rows: Row[], fallback: number) =>
  rows.length ? rows[rows.length - 1].seq : fallback;

// Tải sổ gia tăng: chỉ lấy dòng có seq lớn hơn dòng đã có, nối vào bản đã nhớ.
// Sổ chỉ ghi thêm nên dòng cũ không đổi; nhưng Xóa dữ liệu phát sinh có thể xóa dòng, hoặc dòng seq nhỏ commit trễ,
// nên so số dòng với máy chủ: lệch thì bỏ bản nhớ và tải lại đủ (không bao giờ trả sổ sai).
export async function syncMovements(
  cache: MovementCache | undefined,
  fetchSince: (afterSeq: number) => Promise<Row[]>,
  fetchCount: () => Promise<number>
): Promise<MovementCache> {
  const base = cache ?? EMPTY;
  if (base.rows.length === 0) {
    const rows = await fetchSince(0);
    return { rows, maxSeq: lastSeq(rows, 0) };
  }
  const [fresh, count] = await Promise.all([
    fetchSince(base.maxSeq),
    fetchCount(),
  ]);
  const rows = base.rows.concat(fresh);
  if (rows.length === count)
    return { rows, maxSeq: lastSeq(fresh, base.maxSeq) };
  const all = await fetchSince(0);
  return { rows: all, maxSeq: lastSeq(all, 0) };
}
