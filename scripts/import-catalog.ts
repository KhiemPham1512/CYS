/// <reference types="node" />
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/database.types.ts";
import { parseCatalogCsv, type CatalogRow } from "../src/catalog/csv.ts";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`Thiếu biến môi trường ${name}`);
    process.exit(1);
  }
  return value;
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error(
      "Cách dùng: node --env-file=.env scripts/import-catalog.ts <đường-dẫn.csv>"
    );
    process.exit(1);
  }

  const url = requireEnv("EXPO_PUBLIC_SUPABASE_URL");
  const key = requireEnv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const email = requireEnv("CYS_EMAIL");
  const password = requireEnv("CYS_PASSWORD");

  const text = readFileSync(csvPath, "utf8");
  const { rows, errors } = parseCatalogCsv(text);
  if (errors.length > 0) {
    for (const err of errors) {
      console.error(err);
    }
    process.exit(1);
  }

  const supabase = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({ email, password });
  if (authError || !authData.session) {
    console.error(
      `Đăng nhập thất bại: ${authError?.message ?? "Không có phiên"}`
    );
    process.exit(1);
  }

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("branch_id")
    .eq("user_id", authData.session.user.id)
    .eq("is_locked", false)
    .order("branch_id")
    .limit(1)
    .maybeSingle();

  if (memberError || !member) {
    console.error(
      memberError
        ? `Lỗi lấy Chi nhánh: ${memberError.message}`
        : "Người dùng chưa thuộc Chi nhánh nào hoặc đã bị khóa."
    );
    process.exit(1);
  }

  const branchId = member.branch_id;
  const groupMap = new Map<string, CatalogRow["group"]>();
  for (const row of rows) {
    if (!groupMap.has(row.group.name)) {
      groupMap.set(row.group.name, row.group);
    }
  }

  const groupPayloads = Array.from(groupMap.values()).map((g) => ({
    branch_id: branchId,
    name: g.name,
    name_zh: g.name_zh,
    sort_order: g.sort_order,
  }));

  const { data: savedGroups, error: groupError } = await supabase
    .from("item_groups")
    .upsert(groupPayloads, { onConflict: "branch_id,name" })
    .select("id, name");

  if (groupError || !savedGroups) {
    console.error(`Lỗi nạp Nhóm: ${groupError?.message ?? "Không rõ"}`);
    process.exit(1);
  }

  const groupIdByName = new Map<string, string>();
  for (const g of savedGroups) {
    groupIdByName.set(g.name, g.id);
  }

  const itemPayloads = rows.map((row) => {
    const groupId = groupIdByName.get(row.group.name);
    if (!groupId) {
      throw new Error(`Không tìm thấy id của Nhóm: ${row.group.name}`);
    }
    return {
      branch_id: branchId,
      group_id: groupId,
      ...row.item,
    };
  });

  const { error: itemError } = await supabase
    .from("items")
    .upsert(itemPayloads, { onConflict: "branch_id,name" });

  if (itemError) {
    console.error(`Lỗi nạp Nguyên vật liệu: ${itemError.message}`);
    process.exit(1);
  }

  console.log(
    `Đã nạp thành công ${groupPayloads.length} Nhóm và ${itemPayloads.length} Nguyên vật liệu.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
