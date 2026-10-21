import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdmin, HttpError, jsonResponse } from "../_shared/verify-admin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TELEGRAM_ID = Deno.env.get("ADMIN_TELEGRAM_ID")!;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DEDUP_WINDOW_MS = 10 * 60 * 1000; // 10 хвилин між окремими записами одного користувача

async function pruneOldVisits(supabase: ReturnType<typeof createClient>) {
  const cutoffIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  await supabase
    .from("user_visits")
    .delete()
    .lt("visited_at", cutoffIso);
}

async function checkIsStarosta(supabase: ReturnType<typeof createClient>, telegramId: number): Promise<boolean> {
  if (!telegramId || Number.isNaN(telegramId)) return false;
  if (String(telegramId) === ADMIN_TELEGRAM_ID) return true;

  const { data: roleRow } = await supabase
    .from("starosta_roles")
    .select("telegram_id")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  if (roleRow) return true;

  const { data: tgRow } = await supabase
    .from("telegram_users")
    .select("is_starosta")
    .eq("telegram_id", telegramId)
    .maybeSingle();
  return Boolean(tgRow?.is_starosta);
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

      const isAdmin = String(profile.telegram_id) === ADMIN_TELEGRAM_ID;
      const isStarosta = await checkIsStarosta(supabase, profile.telegram_id);

      return jsonResponse(200, {
        logged: true,
        is_admin: isAdmin,
        is_starosta: isStarosta,
      });
    }

    // Далі всі дії — ТІЛЬКИ І ТІЛЬКИ ДЛЯ АДМІНІСТРАТОРА
    const adminUser = await verifyAdmin(req);
    if (!adminUser.isAdmin) {
      throw new HttpError(403, "Доступ дозволено лише адміністратору");
    }

    if (action === "set_starosta") {
      const targetTgId = Number(body.telegram_id);
      const makeStarosta = Boolean(body.is_starosta);

      if (!targetTgId || Number.isNaN(targetTgId) || targetTgId <= 0) {
        throw new HttpError(400, "Некоректний Telegram ID користувача");
      }

      if (String(targetTgId) === ADMIN_TELEGRAM_ID && !makeStarosta) {
        throw new HttpError(400, "Адміністратор за замовчуванням завжди є старостою");
      }

      if (makeStarosta) {
        await supabase
          .from("starosta_roles")
          .upsert({
            telegram_id: targetTgId,
            assigned_by: adminUser.telegramId,
            assigned_at: new Date().toISOString(),
          });
        await supabase
          .from("telegram_users")
          .update({ is_starosta: true })
          .eq("telegram_id", targetTgId);
      } else {
        await supabase
          .from("starosta_roles")
          .delete()
          .eq("telegram_id", targetTgId);
        await supabase
          .from("telegram_users")
          .update({ is_starosta: false })
          .eq("telegram_id", targetTgId);
      }

      return jsonResponse(200, {
        ok: true,
        telegram_id: targetTgId,
        is_starosta: makeStarosta,
      });
    }

    // action === "list"
    const cutoffIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
    const [visitsRes, tgUsersRes, rolesRes] = await Promise.all([
      supabase
        .from("user_visits")
        .select("id, telegram_id, username, first_name, last_name, photo_url, group_code, device, visited_at")
        .gte("visited_at", cutoffIso)
        .order("visited_at", { ascending: false })
        .limit(500),
      supabase
        .from("telegram_users")
        .select("telegram_id, username, first_name, last_name, photo_url, is_starosta, created_at")
        .order("created_at", { ascending: false }),
      supabase
        .from("starosta_roles")
        .select("telegram_id"),
    ]);

    if (visitsRes.error) {
      console.error("Failed to fetch user_visits:", visitsRes.error);
      throw new HttpError(500, "Failed to load visits");
    }

    const visits = visitsRes.data || [];
    const tgUsers = tgUsersRes.data || [];
    const roleRows = rolesRes.data || [];

    const starostaSet = new Set<number>();
    const adminTgIdNum = Number(ADMIN_TELEGRAM_ID);
    if (adminTgIdNum && !Number.isNaN(adminTgIdNum)) {
      starostaSet.add(adminTgIdNum);
    }
    for (const r of roleRows) {
      const id = Number(r.telegram_id);
      if (id && !Number.isNaN(id)) starostaSet.add(id);
    }
    for (const u of tgUsers) {
      const id = Number(u.telegram_id);
      if (id && !Number.isNaN(id) && u.is_starosta) starostaSet.add(id);
    }

    // Build unified directory of all Telegram users (registered + visitors with real positive telegram_id)
    const usersMap = new Map<number, {
      telegram_id: number;
      username: string | null;
      first_name: string | null;
      last_name: string | null;
      photo_url: string | null;
      is_admin: boolean;
      is_starosta: boolean;
      last_seen: string | null;
    }>();

    for (const u of tgUsers) {
      const id = Number(u.telegram_id);
      if (!id || Number.isNaN(id) || id <= 0) continue;
      usersMap.set(id, {
        telegram_id: id,
        username: u.username || null,
        first_name: u.first_name || null,
        last_name: u.last_name || null,
        photo_url: u.photo_url || null,
        is_admin: String(id) === ADMIN_TELEGRAM_ID,
        is_starosta: starostaSet.has(id),
        last_seen: u.created_at || null,
      });
    }

    for (const v of visits) {
      const id = Number(v.telegram_id);
      if (!id || Number.isNaN(id) || id <= 0) continue;
      const existing = usersMap.get(id);
      if (!existing) {
        usersMap.set(id, {
          telegram_id: id,
          username: v.username || null,
          first_name: v.first_name || null,
          last_name: v.last_name || null,
          photo_url: v.photo_url || null,
          is_admin: String(id) === ADMIN_TELEGRAM_ID,
          is_starosta: starostaSet.has(id),
          last_seen: v.visited_at || null,
        });
      } else {
        if (!existing.username && v.username) existing.username = v.username;
        if (!existing.first_name && v.first_name) existing.first_name = v.first_name;
        if (!existing.last_name && v.last_name) existing.last_name = v.last_name;
        if (v.visited_at && (!existing.last_seen || new Date(v.visited_at) > new Date(existing.last_seen))) {
          existing.last_seen = v.visited_at;
        }
      }
    }

    const users = Array.from(usersMap.values()).sort((a, b) => {
      if (a.is_admin !== b.is_admin) return a.is_admin ? -1 : 1;
      if (a.is_starosta !== b.is_starosta) return a.is_starosta ? -1 : 1;
      const tA = a.last_seen ? new Date(a.last_seen).getTime() : 0;
      const tB = b.last_seen ? new Date(b.last_seen).getTime() : 0;
      return tB - tA;
    });

    return jsonResponse(200, {
      visits,
      users,
      starosta_ids: Array.from(starostaSet),
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse(err.status, { error: err.message });
    }
    console.error("Unexpected error in admin-visits:", err);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
