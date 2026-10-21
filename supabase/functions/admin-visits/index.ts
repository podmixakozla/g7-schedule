import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdmin, HttpError, jsonResponse } from "../_shared/verify-admin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 хвилин між окремими записами одного користувача

async function pruneOldVisits(supabase: ReturnType<typeof createClient>) {
  const cutoffIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  await supabase
    .from("user_visits")
    .delete()
    .lt("visited_at", cutoffIso);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "list";

    // Завжди очищуємо візити, яким більше 7 днів (тижня)
    await pruneOldVisits(supabase);

    if (action === "log") {
      const groupCode = typeof body.group_code === "string" ? body.group_code : "AR-26-1";
      const device = typeof body.device === "string" ? body.device.slice(0, 80) : null;

      // Спробуємо визначити авторизованого користувача за JWT
      let profile: {
        id: string;
        telegram_id: number;
        username: string | null;
        first_name: string | null;
        last_name: string | null;
        photo_url: string | null;
      } | null = null;

      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

      if (token && token.split(".").length === 3) {
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user?.id) {
          const { data: tgUser } = await supabase
            .from("telegram_users")
            .select("id, telegram_id, username, first_name, last_name, photo_url")
            .eq("id", userData.user.id)
            .maybeSingle();
          if (tgUser) profile = tgUser;
        }
      }

      // Якщо токен не передано, але передано дані з Telegram WebApp initDataUnsafe
      if (!profile && body.telegram_user && typeof body.telegram_user === "object") {
        const raw = body.telegram_user;
        const tgId = Number(raw.id || raw.telegram_id);
        if (tgId && !Number.isNaN(tgId)) {
          const { data: existing } = await supabase
            .from("telegram_users")
            .select("id, telegram_id, username, first_name, last_name, photo_url")
            .eq("telegram_id", tgId)
            .maybeSingle();

          profile = existing || {
            id: "",
            telegram_id: tgId,
            username: typeof raw.username === "string" ? raw.username : null,
            first_name: typeof raw.first_name === "string" ? raw.first_name : null,
            last_name: typeof raw.last_name === "string" ? raw.last_name : null,
            photo_url: typeof raw.photo_url === "string" ? raw.photo_url : null,
          };
        }
      }

      if (!profile) {
        return jsonResponse(200, { logged: false });
      }

      const recentCutoff = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
      const { data: recentVisit } = await supabase
        .from("user_visits")
        .select("id")
        .eq("telegram_id", profile.telegram_id)
        .gte("visited_at", recentCutoff)
        .order("visited_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (recentVisit) {
        await supabase
          .from("user_visits")
          .update({
            visited_at: new Date().toISOString(),
            username: profile.username,
            first_name: profile.first_name,
            last_name: profile.last_name,
            photo_url: profile.photo_url,
            group_code: groupCode,
            device,
          })
          .eq("id", recentVisit.id);
      } else {
        await supabase.from("user_visits").insert({
          user_id: profile.id || null,
          telegram_id: profile.telegram_id,
          username: profile.username,
          first_name: profile.first_name,
          last_name: profile.last_name,
          photo_url: profile.photo_url,
          group_code: groupCode,
          device,
        });
      }

      return jsonResponse(200, { logged: true });
    }

    // action === "list": ТІЛЬКИ І ТІЛЬКИ ДЛЯ АДМІНІСТРАТОРА
    const adminUser = await verifyAdmin(req);
    if (!adminUser.isAdmin) {
      throw new HttpError(403, "Доступ дозволено лише адміністратору");
    }

    const cutoffIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const { data: visits, error } = await supabase
      .from("user_visits")
      .select("id, telegram_id, username, first_name, last_name, photo_url, group_code, device, visited_at")
      .gte("visited_at", cutoffIso)
      .order("visited_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Failed to fetch user_visits:", error);
      throw new HttpError(500, "Failed to load visits");
    }

    return jsonResponse(200, { visits: visits || [] });
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse(err.status, { error: err.message });
    }
    console.error("Unexpected error in admin-visits:", err);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
