export function normalizeVi(s: string): string {
  return s
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function matchesQuery(
  item: { name: string; name_zh: string | null },
  query: string
): boolean {
  const q = normalizeVi(query);
  if (!q) return true;
  const nameNorm = normalizeVi(item.name);
  const tokens = q.split(" ");
  return tokens.every(
    (t) =>
      nameNorm.includes(t) ||
      (item.name_zh !== null && item.name_zh.includes(t))
  );
}
