// Edge Function: Quản trị quản lý Người dùng của Chi nhánh mình.
// Khóa secret chỉ có ở đây (biến môi trường mặc định của Supabase), không có trong app.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  BAN_FOREVER,
  UNBAN,
  canActOn,
  messageForDbError,
  parseAdminRequest,
} from "./logic.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
const fail = (status: number, error: string) => json(status, { error });

const url = Deno.env.get("SUPABASE_URL")!;
const publishableKey = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!)[
  "default"
];
const secretKey = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!)["default"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return fail(405, "Chỉ nhận POST");

  const authorization = req.headers.get("Authorization");
  if (!authorization) return fail(401, "Chưa đăng nhập");

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return fail(401, "Chưa đăng nhập");

  const admin = createClient(url, secretKey, {
    auth: { persistSession: false },
  });

  const { data: caller } = await admin
    .from("members")
    .select("branch_id")
    .eq("user_id", user.id)
    .eq("is_admin", true)
    .eq("is_locked", false)
    .order("branch_id")
    .limit(1)
    .maybeSingle();
  if (!caller) return fail(403, "Chỉ Quản trị làm được việc này");
  const branchId: string = caller.branch_id;

  const parsed = parseAdminRequest(await req.json().catch(() => null));
  if (!parsed.ok) return fail(400, parsed.error);
  const request = parsed.value;
  const denied = canActOn(user.id, request);
  if (denied) return fail(400, denied);

  if (request.action === "list") {
    const { data: members, error } = await admin
      .from("members")
      .select("user_id, is_admin, is_locked, created_at")
      .eq("branch_id", branchId);
    if (error) return fail(500, messageForDbError(error));
    const users = await Promise.all(
      members.map(async (m) => {
        const { data, error } = await admin.auth.admin.getUserById(m.user_id);
        if (error) console.error("getUserById", m.user_id, error.message);
        return { ...m, email: data.user?.email ?? "(không đọc được email)" };
      })
    );
    users.sort((a, b) => a.email.localeCompare(b.email));
    return json(200, { data: users });
  }

  if (request.action === "create") {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: request.email,
        password: request.password,
        email_confirm: true,
      });
    if (createError || !created.user) {
      const exists =
        createError?.status === 422 ||
        /already/i.test(createError?.message ?? "");
      return exists
        ? fail(409, "Email đã được dùng")
        : fail(500, "Không tạo được Người dùng. Thử lại sau.");
    }
    const { error: memberError } = await admin.from("members").insert({
      branch_id: branchId,
      user_id: created.user.id,
      is_admin: request.is_admin,
    });
    if (memberError) {
      const { error: undoError } = await admin.auth.admin.deleteUser(
        created.user.id
      ); // hoàn tác
      if (undoError) {
        console.error(
          "Hoàn tác tạo Người dùng lỗi",
          created.user.id,
          undoError.message
        );
      }
      return fail(500, messageForDbError(memberError));
    }
    return json(200, { data: { user_id: created.user.id } });
  }

  // set_locked / set_admin / set_password: người đích phải thuộc Chi nhánh của Quản trị.
  const { data: target } = await admin
    .from("members")
    .select("is_locked")
    .eq("branch_id", branchId)
    .eq("user_id", request.user_id)
    .maybeSingle();
  if (!target) return fail(404, "Không tìm thấy Người dùng trong Chi nhánh");

  if (request.action === "set_admin") {
    const { error } = await admin
      .from("members")
      .update({ is_admin: request.is_admin })
      .eq("branch_id", branchId)
      .eq("user_id", request.user_id);
    if (error) return fail(409, messageForDbError(error));
    return json(200, { data: null });
  }

  if (request.action === "set_password") {
    // Đặt lại cho cả người đang bị khóa (mở khóa xong dùng luôn). Phiên cũ do Supabase Auth thu hồi khi đổi mật khẩu;
    // access token còn sống tới khi hết hạn (tối đa ~1 giờ).
    const { error } = await admin.auth.admin.updateUserById(request.user_id, {
      password: request.password,
    });
    if (error) {
      console.error("set_password", request.user_id, error.message);
      return fail(500, "Không đặt lại được mật khẩu. Thử lại sau.");
    }
    return json(200, { data: null });
  }

  // set_locked: đổi dữ liệu trước (trigger chặn khóa Quản trị cuối), rồi cấm/mở đăng nhập.
  const { error: lockError } = await admin
    .from("members")
    .update({ is_locked: request.locked })
    .eq("branch_id", branchId)
    .eq("user_id", request.user_id);
  if (lockError) return fail(409, messageForDbError(lockError));
  // shortcut: ban áp dụng cho cả hệ thống Auth, đúng khi mỗi Người dùng chỉ thuộc một Chi nhánh;
  // khi có nhiều Chi nhánh thì chỉ gỡ cấm khi người đó không còn bị khóa ở Chi nhánh nào.
  const { error: banError } = await admin.auth.admin.updateUserById(
    request.user_id,
    { ban_duration: request.locked ? BAN_FOREVER : UNBAN }
  );
  if (banError) {
    const { error: undoError } = await admin
      .from("members")
      .update({ is_locked: target.is_locked })
      .eq("branch_id", branchId)
      .eq("user_id", request.user_id);
    if (undoError) {
      console.error(
        "Hoàn tác khóa lỗi, members và ban lệch nhau",
        request.user_id,
        undoError.message
      );
    }
    return fail(500, "Không cập nhật được đăng nhập. Thử lại sau.");
  }
  return json(200, { data: null });
});
