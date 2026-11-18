import type { Tables } from "../lib/database.types";
import { matchesQuery, normalizeVi } from "./search";

export type SectionGroup = Pick<
  Tables<"item_groups">,
  "id" | "name" | "sort_order"
> & { name_zh?: string | null };

export type SectionItem = Pick<
  Tables<"items">,
  "id" | "group_id" | "name" | "name_zh" | "is_hidden" | "sort_order"
>;

// Thứ tự Nhóm: sort_order rồi tên tiếng Việt.
export const compareGroups = (
  a: Pick<SectionGroup, "name" | "sort_order">,
  b: Pick<SectionGroup, "name" | "sort_order">
): number => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "vi");

// Thứ tự món như trên tờ giấy (sort_order), cùng số thì theo tên tiếng Việt.
export const compareItems = (
  a: Pick<SectionItem, "name" | "sort_order">,
  b: Pick<SectionItem, "name" | "sort_order">
): number => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "vi");

export function buildSections<G extends SectionGroup, I extends SectionItem>(
  groups: readonly G[],
  items: readonly I[],
  opts: { query: string; showHidden: boolean }
): { group: G; items: I[] }[] {
  const hasQuery = normalizeVi(opts.query) !== "";
  const sortedGroups = [...groups].sort(compareGroups);

  const itemsByGroup = new Map<string, I[]>();
  for (const item of items) {
    if (!opts.showHidden && item.is_hidden) continue;
    if (!matchesQuery(item, opts.query)) continue;
    const list = itemsByGroup.get(item.group_id);
    if (list) list.push(item);
    else itemsByGroup.set(item.group_id, [item]);
  }

  const sections: { group: G; items: I[] }[] = [];
  for (const group of sortedGroups) {
    const groupItems = itemsByGroup.get(group.id) ?? [];
    if (hasQuery && groupItems.length === 0) continue;
    groupItems.sort(compareItems);
    sections.push({ group, items: groupItems });
  }
  return sections;
}
