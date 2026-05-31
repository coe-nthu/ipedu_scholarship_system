import { NextResponse } from "next/server";
import { checkDashboardAccess, isDashboardScope } from "@/lib/auth";
import { isValidUUID } from "@/lib/validation";

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("尚未設定 SUPABASE_URL 與 SUPABASE_SERVICE_ROLE_KEY。");
  }

  return {
    serviceRoleKey,
    url: url.replace(/\/$/, ""),
  };
}

function jsonError(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/* ------------------------------------------------------------------ */
/*  GET — List all authorized emails                                   */
/* ------------------------------------------------------------------ */

export async function GET() {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    const { serviceRoleKey, url } = getSupabaseConfig();

    const response = await fetch(
      `${url}/rest/v1/authorized_emails?order=created_at.asc&select=id,email,role,department_scope,added_by,created_at,updated_at`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("查詢授權名單失敗。");
    }

    const entries = await response.json();
    return NextResponse.json({ success: true, entries });
  } catch (error) {
    console.error("Authorized-emails error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

/* ------------------------------------------------------------------ */
/*  POST — Add a new authorized email (admin only)                     */
/* ------------------------------------------------------------------ */

export async function POST(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    if (auth.role !== "admin") {
      return jsonError("只有管理員可以新增授權 Email。", 403);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const body = (await request.json()) as {
      email?: string;
      role?: string;
      departmentScope?: unknown;
    };

    const email = body.email?.trim().toLowerCase();
    const role = body.role;

    if (!email) {
      return jsonError("請提供 Email。");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonError("Email 格式不合法。");
    }

    if (role !== "teacher" && role !== "admin") {
      return jsonError("角色必須是 teacher 或 admin。");
    }

    if (
      body.departmentScope !== undefined &&
      !isDashboardScope(body.departmentScope)
    ) {
      return jsonError("系所範圍格式不合法。");
    }

    // Insert into authorized_emails
    const insertRes = await fetch(`${url}/rest/v1/authorized_emails`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        email,
        role,
        added_by: auth.userId,
        ...(body.departmentScope !== undefined
          ? { department_scope: body.departmentScope }
          : {}),
      }),
    });

    if (!insertRes.ok) {
      const errorText = await insertRes.text();
      if (errorText.includes("duplicate") || errorText.includes("unique")) {
        return jsonError("此 Email 已在授權名單中。");
      }
      throw new Error("新增授權 Email 失敗。");
    }

    const [entry] = await insertRes.json();

    // Sync: if this email already has a profile, update their role
    await fetch(
      `${url}/rest/v1/profiles?email=eq.${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role }),
      }
    );

    return NextResponse.json({ success: true, entry });
  } catch (error) {
    console.error("Authorized-emails error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

/* ------------------------------------------------------------------ */
/*  PATCH — Update an entry's role (admin only)                        */
/* ------------------------------------------------------------------ */

export async function PATCH(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    if (auth.role !== "admin") {
      return jsonError("只有管理員可以修改授權名單。", 403);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const body = (await request.json()) as {
      id?: string;
      role?: string;
    };

    const { id, role } = body;

    if (!id) {
      return jsonError("缺少 id。");
    }

    if (!isValidUUID(id)) {
      return jsonError("id 格式不合法。");
    }

    if (role !== "teacher" && role !== "admin") {
      return jsonError("角色必須是 teacher 或 admin。");
    }

    // Fetch the entry to check if it's the current user downgrading themselves
    const checkRes = await fetch(
      `${url}/rest/v1/authorized_emails?id=eq.${id}&select=email,role`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!checkRes.ok) {
      throw new Error("查詢失敗。");
    }

    const [existing] = (await checkRes.json()) as {
      email: string;
      role: string;
    }[];

    if (!existing) {
      return jsonError("找不到此授權記錄。", 404);
    }

    // Prevent self-downgrade from admin to teacher
    if (
      existing.email.toLowerCase() === auth.email.toLowerCase() &&
      existing.role === "admin" &&
      role === "teacher"
    ) {
      return jsonError("無法降級自己的管理員權限。");
    }

    // Update the entry
    const updateRes = await fetch(
      `${url}/rest/v1/authorized_emails?id=eq.${id}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
          prefer: "return=representation",
        },
        body: JSON.stringify({ role }),
      }
    );

    if (!updateRes.ok) {
      throw new Error("更新角色失敗。");
    }

    // Sync profiles table
    await fetch(
      `${url}/rest/v1/profiles?email=eq.${encodeURIComponent(existing.email.toLowerCase())}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role }),
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Authorized-emails error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}

/* ------------------------------------------------------------------ */
/*  DELETE — Remove an authorized email (admin only)                   */
/* ------------------------------------------------------------------ */

export async function DELETE(request: Request) {
  try {
    const auth = await checkDashboardAccess();
    if (!auth.authorized) {
      return jsonError(
        auth.reason === "not_authenticated" ? "請先登入。" : "無權限存取。",
        auth.reason === "not_authenticated" ? 401 : 403
      );
    }

    if (auth.role !== "admin") {
      return jsonError("只有管理員可以刪除授權 Email。", 403);
    }

    const { serviceRoleKey, url } = getSupabaseConfig();
    const body = (await request.json()) as { id?: string };
    const { id } = body;

    if (!id) {
      return jsonError("缺少 id。");
    }

    if (!isValidUUID(id)) {
      return jsonError("id 格式不合法。");
    }

    // Fetch the entry to validate
    const checkRes = await fetch(
      `${url}/rest/v1/authorized_emails?id=eq.${id}&select=email,role`,
      {
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!checkRes.ok) {
      throw new Error("查詢失敗。");
    }

    const [existing] = (await checkRes.json()) as {
      email: string;
      role: string;
    }[];

    if (!existing) {
      return jsonError("找不到此授權記錄。", 404);
    }

    // Prevent self-deletion
    if (existing.email.toLowerCase() === auth.email.toLowerCase()) {
      return jsonError("無法刪除自己的授權。");
    }

    // Prevent deleting the last admin
    if (existing.role === "admin") {
      const countRes = await fetch(
        `${url}/rest/v1/authorized_emails?role=eq.admin&select=id`,
        {
          headers: {
            apikey: serviceRoleKey,
            authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      );
      if (countRes.ok) {
        const admins = (await countRes.json()) as { id: string }[];
        if (admins.length <= 1) {
          return jsonError("無法刪除最後一位管理員。");
        }
      }
    }

    // Delete the entry
    const deleteRes = await fetch(
      `${url}/rest/v1/authorized_emails?id=eq.${id}`,
      {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!deleteRes.ok) {
      throw new Error("刪除失敗。");
    }

    // Sync: downgrade the user's profile to student
    await fetch(
      `${url}/rest/v1/profiles?email=eq.${encodeURIComponent(existing.email.toLowerCase())}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceRoleKey,
          authorization: `Bearer ${serviceRoleKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: "student" }),
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Authorized-emails error:", error);
    return jsonError("伺服器處理時發生錯誤。", 500);
  }
}
