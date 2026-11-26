// Edge Function: Quản trị quán quản lý Nhân viên của quán mình; Quản trị cấp cao quản lý mọi quán (ADR 0002).
// Khóa secret chỉ có ở đây (biến môi trường mặc định của Supabase), không có trong app.
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  BAN_FOREVER,
  UNBAN,
  type CallerRole,
  canActOn,
  deniedFor,
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

  // Cấp cao hỏi bằng JWT của người gọi (is_owner chỉ trả lời về chính mình); lỗi = không phải cấp cao.
  const [{ data: ownerFlag }, { data: me }] = await Promise.all([
    userClient.rpc("is_owner"),
    admin
      .from("members")
      .select("branch_id, is_admin")
      .eq("user_id", user.id)
      .eq("is_locked", false)
      .maybeSingle(),
  ]);
  const role: CallerRole | null =
    ownerFlag === true ? "owner" : me?.is_admin ? "branch_admin" : null;
  if (!role) return fail(403, "Chỉ Quản trị làm được việc này");

  const parsed = parseAdminRequest(await req.json().catch(() => null));
  if (!parsed.ok) return fail(400, parsed.error);
  const request = parsed.value;
  const selfDenied = canActOn(user.id, request);
  if (selfDenied) return fail(400, selfDenied);
  const roleDenied = deniedFor(role, request);
  if (roleDenied) return fail(403, roleDenied);

  async function withEmails<T extends { user_id: string }>(members: T[]) {
    const users = await Promise.all(
      members.map(async (m) => {
        const { data, error } = await admin.auth.admin.getUserById(m.user_id);
        if (error) console.error("getUserById", m.user_id, error.message);
        return { ...m, email: data.user?.email ?? "(không đọc được email)" };
      })
    );
    return users.sort((a, b) => a.email.localeCompare(b.email));
  }

  // Web cần biết ai là cấp cao để ẩn nút (private.owners không đọc thẳng được).
  async function withOwnerFlag<T extends { user_id: string }>(members: T[]) {
    return await Promise.all(
      members.map(async (m) => {
        const { data } = await admin.rpc("user_is_owner", {
          p_user: m.user_id,
        });
        return { ...m, is_owner: data === true };
      })
    );
  }

  if (request.action === "list_all") {
    const { data: members, error } = await admin
      .from("members")
      .select("user_id, branch_id, is_admin, is_locked, created_at");
    if (error) return fail(500, messageForDbError(error));
    return json(200, { data: await withEmails(await withOwnerFlag(members)) });
  }

  // Quán của list/create: cấp cao chọn (mặc định quán của mình), Quản trị quán luôn là quán mình.
  const branchId: string | undefined =
    role === "owner" && "branch_id" in request && request.branch_id
      ? request.branch_id
      : me?.branch_id;

  if (request.action === "list") {
    if (!branchId) return fail(400, "Chưa chọn Chi nhánh");
    const { data: members, error } = await admin
      .from("members")
      .select("user_id, is_admin, is_locked, created_at")
      .eq("branch_id", branchId);
    if (error) return fail(500, messageForDbError(error));
    return json(200, { data: await withEmails(await withOwnerFlag(members)) });
  }

  if (request.action === "create") {
    if (!branchId) return fail(400, "Chưa chọn Chi nhánh");
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

  // set_locked / set_admin / set_password: Quản trị quán chỉ với người trong quán mình; cấp cao mọi quán.
  let targetQuery = admin
    .from("members")
    .select("branch_id, is_admin, is_locked")
    .eq("user_id", request.user_id);
  if (role === "branch_admin")
    targetQuery = targetQuery.eq("branch_id", me!.branch_id);
  const { data: target } = await targetQuery.maybeSingle();
  if (!target) return fail(404, "Không tìm thấy Người dùng trong Chi nhánh");
  // Cấp cao có thể mang is_admin=false nên hỏi thẳng private.owners; lỗi thì từ chối (an toàn).
  let targetIsOwner = false;
  if (role === "branch_admin") {
    const { data, error } = await admin.rpc("user_is_owner", {
      p_user: request.user_id,
    });
    if (error) {
      console.error("user_is_owner", request.user_id, error.message);
      return fail(500, "Không kiểm tra được quyền. Thử lại sau.");
    }
    targetIsOwner = data === true;
  }
  const targetDenied = deniedFor(role, request, {
    is_admin: target.is_admin,
    is_owner: targetIsOwner,
    is_self: request.user_id === user.id,
  });
  if (targetDenied) return fail(403, targetDenied);
  const targetBranch: string = target.branch_id;

  if (request.action === "set_admin") {
    const { error } = await admin
      .from("members")
      .update({ is_admin: request.is_admin })
      .eq("branch_id", targetBranch)
      .eq("user_id", request.user_id);
    if (error) return fail(409, messageForDbError(error));
    return json(200, { data: null });
  }

  if (request.action === "set_password") {
    // Đặt lại cho cả người đang bị khóa (mở khóa xong dùng luôn).
    // shortcut: chưa thu hồi phiên đang mở (admin.updateUserById không đảm bảo); máy đang đăng nhập dùng tiếp được tới khi token hết hạn, nghi lộ thì Khóa người đó.
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
    .eq("branch_id", targetBranch)
    .eq("user_id", request.user_id);
  if (lockError) return fail(409, messageForDbError(lockError));
  // Ban áp dụng cho cả hệ thống Auth: đúng vì mỗi Người dùng thuộc đúng một Chi nhánh (unique members.user_id).
  const { error: banError } = await admin.auth.admin.updateUserById(
    request.user_id,
    { ban_duration: request.locked ? BAN_FOREVER : UNBAN }
  );
  if (banError) {
    const { error: undoError } = await admin
      .from("members")
      .update({ is_locked: target.is_locked })
      .eq("branch_id", targetBranch)
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
