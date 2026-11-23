import type { Tables } from "../lib/database.types";

type Row = Tables<"stock_movements">;
export type MovementCache = { rows: Row[] }; // rows xếp theo seq tăng dần

// Tải sổ gia tăng: chỉ lấy dòng có seq lớn hơn dòng đã có, nối vào bản đã nhớ.
// Sổ chỉ ghi thêm nên dòng cũ không đổi; nhưng Xóa dữ liệu phát sinh có thể xóa dòng, hoặc dòng seq nhỏ commit trễ,
// nên so số dòng với máy chủ: lệch thì bỏ bản nhớ và tải lại đủ.
// shortcut: so số dòng không bắt được "xóa k dòng cũ rồi dòng seq nhỏ commit trễ bù đúng k"; bản nhớ chỉ ở bộ nhớ, thoát app là sạch; nâng cấp bằng số phiên sổ trong DB khi cần.
export async function syncMovements(
  cache: MovementCache | undefined,
  fetchSince: (afterSeq: number) => Promise<Row[]>,
  fetchCount: () => Promise<number>
): Promise<MovementCache> {
  const known = cache?.rows ?? [];
  if (known.length === 0) return { rows: await fetchSince(0) };
  const [fresh, count] = await Promise.all([
    fetchSince(known[known.length - 1].seq),
    fetchCount(),
  ]);
  const rows = known.concat(fresh);
  return rows.length === count ? { rows } : { rows: await fetchSince(0) };
}
