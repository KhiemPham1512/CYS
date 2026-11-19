import type { Tables, TablesInsert } from "../lib/database.types";
import {
  parseItemForm,
  toFormValues,
  type ItemFormValues,
} from "./itemFormModel";

export type ItemChanges = Partial<Omit<TablesInsert<"items">, "branch_id">>;

// Bảng sửa hàng loạt: so từng món với giá trị đã sửa, chỉ gửi trường đã đổi; sai thì báo lỗi theo món.
export function diffItemEdits(
  items: Tables<"items">[],
  edits: Record<string, ItemFormValues>
): {
  updates: { id: string; changes: ItemChanges }[];
  errors: Record<string, Partial<Record<keyof ItemFormValues, string>>>;
} {
  const updates: { id: string; changes: ItemChanges }[] = [];
  const errors: Record<
    string,
    Partial<Record<keyof ItemFormValues, string>>
  > = {};
  for (const item of items) {
    const edited = edits[item.id];
    if (!edited) continue;
    const parsed = parseItemForm(edited);
    if (!parsed.ok) {
      errors[item.id] = parsed.errors;
      continue;
    }
    const original = parseItemForm(toFormValues(item));
    if (!original.ok) continue; // dữ liệu cũ không hợp lệ: không so được
    const changes: Record<string, unknown> = {};
    for (const key of Object.keys(
      parsed.value
    ) as (keyof typeof parsed.value)[]) {
      if (parsed.value[key] !== original.value[key])
        changes[key] = parsed.value[key];
    }
    if (Object.keys(changes).length > 0)
      updates.push({ id: item.id, changes: changes as ItemChanges });
  }
  return { updates, errors };
}
