import type {
  ShelfLifeUnit,
  Tables,
  TablesInsert,
} from "../lib/database.types";
import { autoTracksInUse } from "../stock/expiry";

export type ItemFormValues = {
  name: string;
  name_zh: string;
  group_id: string;
  unit: string;
  unit_zh: string;
  case_size: string;
  shelf_life: string;
  shelf_life_unit: ShelfLifeUnit;
  shelf_life_from_receipt_days: string;
  shelf_life_after_open: string;
  shelf_life_after_open_unit: ShelfLifeUnit;
  track_mfg_date: boolean;
  track_in_use: boolean | null;
  record_by_percent: boolean;
  skip_count: boolean;
};

export function emptyForm(groupId = ""): ItemFormValues {
  return {
    name: "",
    name_zh: "",
    group_id: groupId,
    unit: "",
    unit_zh: "",
    case_size: "",
    shelf_life: "",
    shelf_life_unit: "month",
    shelf_life_from_receipt_days: "",
    shelf_life_after_open: "",
    shelf_life_after_open_unit: "day",
    track_mfg_date: false,
    track_in_use: null,
    record_by_percent: false,
    skip_count: false,
  };
}

export function toFormValues(item: Tables<"items">): ItemFormValues {
  return {
    name: item.name,
    name_zh: item.name_zh ?? "",
    group_id: item.group_id,
    unit: item.unit,
    unit_zh: item.unit_zh ?? "",
    case_size: item.case_size === null ? "" : String(item.case_size),
    shelf_life: item.shelf_life === null ? "" : String(item.shelf_life),
    shelf_life_unit: item.shelf_life_unit,
    shelf_life_from_receipt_days:
      item.shelf_life_from_receipt_days === null
        ? ""
        : String(item.shelf_life_from_receipt_days),
    shelf_life_after_open:
      item.shelf_life_after_open === null
        ? ""
        : String(item.shelf_life_after_open),
    shelf_life_after_open_unit: item.shelf_life_after_open_unit,
    track_mfg_date: item.track_mfg_date,
    track_in_use: item.track_in_use,
    record_by_percent: item.record_by_percent,
    skip_count: item.skip_count,
  };
}

export function inUseSwitchValue(v: ItemFormValues): boolean {
  if (v.track_in_use !== null) return v.track_in_use;
  const after = parseOptionalPositiveInt(v.shelf_life_after_open);
  return autoTracksInUse(
    after.ok ? after.value : null,
    v.shelf_life_after_open_unit
  );
}

function parseOptionalPositiveInt(raw: string): {
  ok: boolean;
  value: number | null;
} {
  const s = raw.trim();
  if (!s) return { ok: true, value: null };
  if (!/^\d+$/.test(s)) return { ok: false, value: null };
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n <= 0) return { ok: false, value: null };
  return { ok: true, value: n };
}

export function parseItemForm(
  v: ItemFormValues
):
  | { ok: true; value: Omit<TablesInsert<"items">, "branch_id"> }
  | { ok: false; errors: Partial<Record<keyof ItemFormValues, string>> } {
  const errors: Partial<Record<keyof ItemFormValues, string>> = {};

  const name = v.name.trim();
  const name_zh = v.name_zh.trim() || null;
  const group_id = v.group_id.trim();
  const unit = v.unit.trim();
  const unit_zh = v.unit_zh.trim() || null;

  if (!name) errors.name = "Bắt buộc";
  if (!group_id) errors.group_id = "Bắt buộc";
  if (!unit) errors.unit = "Bắt buộc";

  const caseSize = parseOptionalPositiveInt(v.case_size);
  if (!caseSize.ok) errors.case_size = "Số nguyên lớn hơn 0";

  const shelfLife = parseOptionalPositiveInt(v.shelf_life);
  if (!shelfLife.ok) errors.shelf_life = "Số nguyên lớn hơn 0";

  const shelfLifeReceipt = parseOptionalPositiveInt(
    v.shelf_life_from_receipt_days
  );
  if (!shelfLifeReceipt.ok) {
    errors.shelf_life_from_receipt_days = "Số nguyên lớn hơn 0";
  }

  const shelfLifeOpen = parseOptionalPositiveInt(v.shelf_life_after_open);
  if (!shelfLifeOpen.ok) {
    errors.shelf_life_after_open = "Số nguyên lớn hơn 0";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      name,
      name_zh,
      group_id,
      unit,
      unit_zh,
      case_size: caseSize.value,
      track_mfg_date: v.track_mfg_date,
      track_in_use: shelfLifeOpen.value === null ? null : v.track_in_use,
      shelf_life: shelfLife.value,
      shelf_life_unit: v.shelf_life_unit,
      shelf_life_from_receipt_days: shelfLifeReceipt.value,
      shelf_life_after_open: shelfLifeOpen.value,
      shelf_life_after_open_unit: v.shelf_life_after_open_unit,
      record_by_percent: v.record_by_percent,
      skip_count: v.skip_count,
    },
  };
}
