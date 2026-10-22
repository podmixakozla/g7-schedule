import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError, jsonResponse } from "../_shared/verify-admin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TELEGRAM_ID = Deno.env.get("ADMIN_TELEGRAM_ID")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";

interface StarostaProfile {
  userId: string;
  telegramId: number;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  isAdmin: boolean;
  isStarosta: boolean;
}

async function verifyStarostaOrAdmin(
  req: Request,
  supabase: ReturnType<typeof createClient>
): Promise<StarostaProfile> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new HttpError(401, "Потрібна авторизація через Telegram");
  }

  const token = authHeader.slice(7);
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new HttpError(401, "Недійсна або прострочена сесія");
  }

  const { data: tgUser, error: tgError } = await supabase
    .from("telegram_users")
    .select("telegram_id, username, first_name, last_name, is_starosta")
    .eq("id", user.id)
    .single();

  if (tgError || !tgUser) {
    throw new HttpError(403, "Профіль Telegram не знайдено");
  }

  const telegramId = Number(tgUser.telegram_id);
  const isAdmin = String(telegramId) === ADMIN_TELEGRAM_ID;
  let isStarosta = isAdmin || Boolean(tgUser.is_starosta);

  if (!isStarosta) {
    const { data: roleRow } = await supabase
      .from("starosta_roles")
      .select("telegram_id")
      .eq("telegram_id", telegramId)
      .maybeSingle();
    if (roleRow) isStarosta = true;
  }

  if (!isStarosta) {
    throw new HttpError(403, "Доступ дозволено лише старостам та адміністратору");
  }

  return {
    userId: user.id,
    telegramId,
    username: tgUser.username || null,
    firstName: tgUser.first_name || null,
    lastName: tgUser.last_name || null,
    isAdmin,
    isStarosta,
  };
}

async function sendAnnouncementToChat(
  chatId: number,
  text: string,
  photoUrls: string[]
): Promise<boolean> {
  if (photoUrls.length === 1) {
    const caption = text.length <= 1024 ? text : text.slice(0, 1020) + "…";
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrls[0],
        caption,
      }),
    });
    if (res.ok) {
      if (text.length > 1024) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: text.slice(1020),
            disable_web_page_preview: true,
          }),
        });
      }
      return true;
    }
  } else if (photoUrls.length > 1) {
    const caption = text.length <= 1024 ? text : text.slice(0, 1020) + "…";
    const media = photoUrls.slice(0, 10).map((url, idx) => ({
      type: "photo",
      media: url,
      ...(idx === 0 ? { caption } : {}),
    }));
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        media,
      }),
    });
    if (res.ok) {
      if (text.length > 1024) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: text.slice(1020),
            disable_web_page_preview: true,
          }),
        });
      }
      return true;
    }
  }

  // Fallback or text-only announcement
  const fallbackText = photoUrls.length > 0
    ? `${text}\n\n${photoUrls.join("\n")}`
    : text;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: fallbackText,
      disable_web_page_preview: photoUrls.length === 0,
    }),
  });
  return res.ok;
}

async function broadcastStarostaMessage(
  supabase: ReturnType<typeof createClient>,
  text: string,
  photoUrls: string[] = []
): Promise<{ sent: number; failed: number }> {
  if (!BOT_TOKEN) {
    return { sent: 0, failed: 0 };
  }

  const chatIds = new Set<number>();
  const adminId = Number(ADMIN_TELEGRAM_ID);
  if (adminId && !Number.isNaN(adminId) && adminId > 0) {
    chatIds.add(adminId);
  }

  try {
    const { data: tgUsers } = await supabase
      .from("telegram_users")
      .select("telegram_id");
    if (Array.isArray(tgUsers)) {
      for (const u of tgUsers) {
        const id = Number(u.telegram_id);
        if (id && !Number.isNaN(id) && id > 0) chatIds.add(id);
      }
    }
  } catch (e) {
    console.warn("Failed to read telegram_users:", e);
  }

  try {
    const { data: visitUsers } = await supabase
      .from("user_visits")
      .select("telegram_id");
    if (Array.isArray(visitUsers)) {
      for (const u of visitUsers) {
        const id = Number(u.telegram_id);
        if (id && !Number.isNaN(id) && id > 0) chatIds.add(id);
      }
    }
  } catch (e) {
    console.warn("Failed to read user_visits:", e);
  }

  let sent = 0;
  let failed = 0;
  for (const chatId of chatIds) {
    try {
      const ok = await sendAnnouncementToChat(chatId, text, photoUrls);
      if (ok) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { sent, failed };
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
    const action = body.action || "create";

    const caller = await verifyStarostaOrAdmin(req, supabase);

    if (action === "create") {
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) {
        throw new HttpError(400, "Введіть текст новини");
      }
      if (content.length > 3500) {
        throw new HttpError(400, "Повідомлення занадто довге (максимум 3500 символів)");
      }

      const rawUrls: string[] = [];
      if (Array.isArray(body.photo_urls)) {
        for (const u of body.photo_urls) {
          if (typeof u === "string" && u.trim().startsWith("http")) {
            rawUrls.push(u.trim());
          }
        }
      } else if (typeof body.photo_url === "string" && body.photo_url.trim().startsWith("http")) {
        rawUrls.push(body.photo_url.trim());
      }
      const photoUrls = rawUrls.slice(0, 10);

      const first = (caller.firstName || "").trim();
      const last = (caller.lastName || "").trim();
      const authorName = [first, last].filter(Boolean).join(" ") || caller.username || `ID ${caller.telegramId}`;

      // Деактивуємо попередні активні оголошення, щоб нове стало головним у синьому блоці
      await supabase
        .from("announcements")
        .update({ is_active: false })
        .eq("is_active", true);

      const { data: inserted, error: insertError } = await supabase
        .from("announcements")
        .insert({
          author_telegram_id: caller.telegramId,
          author_name: authorName,
          author_username: caller.username,
          content,
          photo_url: photoUrls[0] || null,
          photo_urls: photoUrls,
          is_active: true,
        })
        .select("*")
        .single();

      if (insertError || !inserted) {
        console.error("Failed to insert announcement:", insertError);
        throw new HttpError(500, "Не вдалося зберегти новину");
      }

      // Формуємо повідомлення в чат бота в ТГ: нік старости + повідомлення старости
      const authorTag = caller.username
        ? `@${caller.username} (${authorName})`
        : authorName;
      const tgText = `📢 Повідомлення від старости ${authorTag}:\n\n${content}`;

      const notify = await broadcastStarostaMessage(supabase, tgText, photoUrls);

      return jsonResponse(200, {
        ok: true,
        announcement: inserted,
        notify,
      });
    }

    if (action === "deactivate" || action === "delete") {
      const id = Number(body.id);
      if (!id || Number.isNaN(id)) {
        throw new HttpError(400, "Некоректний ID новини");
      }

      const { error: delError } = await supabase
        .from("announcements")
        .delete()
        .eq("id", id);

      if (delError) {
        throw new HttpError(500, "Не вдалося видалити новину");
      }

      return jsonResponse(200, { ok: true, id });
    }

    throw new HttpError(400, "Невідома дія");
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse(err.status, { error: err.message });
    }
    console.error("Unexpected error in starosta-announcements:", err);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
