import type { Tables } from "../lib/database.types";
import { matchesQuery, normalizeVi } from "./search";

export type SectionGroup = Pick<
  Tables<"item_groups">,
  "id" | "name" | "sort_order"
> & { name_zh?: string | null };

export type SectionItem = Pick<
  Tables<"items">,
  "id" | "group_id" | "name" | "name_zh" | "is_hidden"
>;

export function buildSections<G extends SectionGroup, I extends SectionItem>(
  groups: readonly G[],
  items: readonly I[],
  opts: { query: string; showHidden: boolean }
): { group: G; items: I[] }[] {
  const hasQuery = normalizeVi(opts.query) !== "";
  const sortedGroups = [...groups].sort(
    (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "vi")
  );

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
    groupItems.sort((a, b) => a.name.localeCompare(b.name, "vi"));
    sections.push({ group, items: groupItems });
  }
  return sections;
}
