// Bản sao của record bỏ các khóa đã cho (không sửa record gốc).
export function omitKeys<T>(
  record: Record<string, T>,
  keys: string[]
): Record<string, T> {
  const next = { ...record };
  for (const key of keys) delete next[key];
  return next;
}
