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

interface TelegramMessageRef {
  chat_id: number;
  message_id: number;
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
): Promise<number[]> {
  const messageIds: number[] = [];

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
      const data = await res.json().catch(() => null);
      if (data?.result?.message_id) {
        messageIds.push(Number(data.result.message_id));
      }
      if (text.length > 1024) {
        const resExtra = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: text.slice(1020),
            disable_web_page_preview: true,
          }),
        });
        if (resExtra.ok) {
          const extraData = await resExtra.json().catch(() => null);
          if (extraData?.result?.message_id) {
            messageIds.push(Number(extraData.result.message_id));
          }
        }
      }
      return messageIds;
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
      const data = await res.json().catch(() => null);
      if (Array.isArray(data?.result)) {
        for (const msg of data.result) {
          if (msg?.message_id) messageIds.push(Number(msg.message_id));
        }
      }
      if (text.length > 1024) {
        const resExtra = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: text.slice(1020),
            disable_web_page_preview: true,
          }),
        });
        if (resExtra.ok) {
          const extraData = await resExtra.json().catch(() => null);
          if (extraData?.result?.message_id) {
            messageIds.push(Number(extraData.result.message_id));
          }
        }
      }
      return messageIds;
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
  if (res.ok) {
    const data = await res.json().catch(() => null);
    if (data?.result?.message_id) {
      messageIds.push(Number(data.result.message_id));
    }
  }
  return messageIds;
}

async function broadcastStarostaMessage(
  supabase: ReturnType<typeof createClient>,
  text: string,
  photoUrls: string[] = [],
  targetGroups: string[] = [],
  authorTelegramId = 0
): Promise<{ sent: number; failed: number; telegramMessages: TelegramMessageRef[] }> {
  if (!BOT_TOKEN) {
    return { sent: 0, failed: 0, telegramMessages: [] };
  }

  const chatIds = new Set<number>();
  const adminId = Number(ADMIN_TELEGRAM_ID);
  if (adminId && !Number.isNaN(adminId) && adminId > 0) {
    chatIds.add(adminId);
  }
  if (authorTelegramId && !Number.isNaN(authorTelegramId) && authorTelegramId > 0) {
    chatIds.add(authorTelegramId);
  }

  const isTargeted = Array.isArray(targetGroups) && targetGroups.length > 0;

  try {
    let query = supabase.from("telegram_users").select("telegram_id, user_group");
    if (isTargeted) {
      query = query.in("user_group", targetGroups);
    }
    const { data: tgUsers } = await query;
    if (Array.isArray(tgUsers)) {
      for (const u of tgUsers) {
        const id = Number(u.telegram_id);
        if (id && !Number.isNaN(id) && id > 0) chatIds.add(id);
      }
    }
  } catch (e) {
    console.warn("Failed to read telegram_users:", e);
  }

  // If broadcast to all, also include user_visits
  if (!isTargeted) {
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
  }

  let sent = 0;
  let failed = 0;
  const telegramMessages: TelegramMessageRef[] = [];

  for (const chatId of chatIds) {
    try {
      const msgIds = await sendAnnouncementToChat(chatId, text, photoUrls);
      if (msgIds.length > 0) {
        sent++;
        for (const mid of msgIds) {
          telegramMessages.push({ chat_id: chatId, message_id: mid });
        }
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { sent, failed, telegramMessages };
}

async function deleteAnnouncementTelegramMessagesAndAssets(
  supabase: ReturnType<typeof createClient>,
  row: any
): Promise<{ deletedTgMessages: number; failedTgMessages: number }> {
  let deletedTgMessages = 0;
  let failedTgMessages = 0;

  if (BOT_TOKEN && Array.isArray(row?.telegram_messages)) {
    for (const ref of row.telegram_messages) {
      const chatId = Number(ref?.chat_id);
      const messageId = Number(ref?.message_id);
      if (!chatId || !messageId) continue;
      try {
        const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
          }),
        });
        if (res.ok) deletedTgMessages++;
        else failedTgMessages++;
      } catch {
        failedTgMessages++;
      }
    }
  }

  // Clean up storage photos if any
  const urls: string[] = [];
  if (Array.isArray(row?.photo_urls)) {
    for (const u of row.photo_urls) {
      if (typeof u === "string") urls.push(u);
    }
  } else if (typeof row?.photo_url === "string") {
    urls.push(row.photo_url);
  }

  const storagePaths: string[] = [];
  const marker = "/storage/v1/object/public/board-photos/";
  for (const u of urls) {
    const idx = u.indexOf(marker);
    if (idx !== -1) {
      storagePaths.push(decodeURIComponent(u.slice(idx + marker.length)));
    }
  }
  if (storagePaths.length > 0) {
    try {
      await supabase.storage.from("board-photos").remove(storagePaths);
    } catch (e) {
      console.warn("Failed to remove announcement storage files:", e);
    }
  }

  return { deletedTgMessages, failedTgMessages };
}

async function cleanupExpiredAnnouncements(
  supabase: ReturnType<typeof createClient>
): Promise<{ expiredDeleted: number; tgDeleted: number }> {
  const nowIso = new Date().toISOString();
  const { data: expiredRows } = await supabase
    .from("announcements")
    .select("*")
    .not("expires_at", "is", null)
    .lte("expires_at", nowIso);

  if (!Array.isArray(expiredRows) || expiredRows.length === 0) {
    return { expiredDeleted: 0, tgDeleted: 0 };
  }

  let expiredDeleted = 0;
  let tgDeleted = 0;

  for (const row of expiredRows) {
    const stats = await deleteAnnouncementTelegramMessagesAndAssets(supabase, row);
    tgDeleted += stats.deletedTgMessages;

    const { error } = await supabase
      .from("announcements")
      .delete()
      .eq("id", row.id);
    if (!error) expiredDeleted++;
  }

  return { expiredDeleted, tgDeleted };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey",
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

    // Always clean up expired announcements first
    const cleanupStats = await cleanupExpiredAnnouncements(supabase);

    // Public cleanup action (can be called by client or cron when timer expires)
    if (action === "cleanup") {
      return jsonResponse(200, {
        ok: true,
        ...cleanupStats,
      });
    }

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

      let expiresAtIso: string | null = null;
      if (typeof body.expires_at === "string" && body.expires_at.trim()) {
        const parsed = new Date(body.expires_at.trim());
        if (!Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now()) {
          expiresAtIso = parsed.toISOString();
        } else {
          throw new HttpError(400, "Час автовидалення має бути в майбутньому");
        }
      }

      const ALLOWED_GROUPS = ["AR-26-1", "AR-26-2", "AR-26sk-1"];
      const GROUP_TITLE_MAP: Record<string, string> = {
        "AR-26-1": "АР-26-1",
        "AR-26-2": "АР-26-2",
        "AR-26sk-1": "АР-26ск-1",
      };

      const rawTargets: string[] = [];
      if (Array.isArray(body.target_groups)) {
        for (const g of body.target_groups) {
          if (typeof g === "string" && ALLOWED_GROUPS.includes(g.trim())) {
            rawTargets.push(g.trim());
          }
        }
      }
      let targetGroups = Array.from(new Set(rawTargets));
      if (targetGroups.length === ALLOWED_GROUPS.length) {
        targetGroups = [];
      }

      const first = (caller.firstName || "").trim();
      const last = (caller.lastName || "").trim();
      const authorName = [first, last].filter(Boolean).join(" ") || caller.username || `ID ${caller.telegramId}`;

      // Деактивуємо лише ті активні оголошення, аудиторія яких перетинається з новою
      const { data: activeRows } = await supabase
        .from("announcements")
        .select("id, target_groups")
        .eq("is_active", true);

      if (Array.isArray(activeRows) && activeRows.length > 0) {
        const toDeactivateIds: number[] = [];
        for (const row of activeRows) {
          const rowTargets: string[] = Array.isArray(row.target_groups) ? row.target_groups : [];
          if (targetGroups.length === 0) {
            if (rowTargets.length === 0) {
              toDeactivateIds.push(row.id);
            }
          } else {
            if (rowTargets.length > 0) {
              const overlaps = targetGroups.some((g) => rowTargets.includes(g));
              if (overlaps) {
                toDeactivateIds.push(row.id);
              }
            }
          }
        }
        if (toDeactivateIds.length > 0) {
          await supabase
            .from("announcements")
            .update({ is_active: false })
            .in("id", toDeactivateIds);
        }
      }

      const { data: inserted, error: insertError } = await supabase
        .from("announcements")
        .insert({
          author_telegram_id: caller.telegramId,
          author_name: authorName,
          author_username: caller.username,
          content,
          photo_url: photoUrls[0] || null,
          photo_urls: photoUrls,
          expires_at: expiresAtIso,
          is_active: true,
          target_groups: targetGroups,
        })
        .select("*")
        .single();

      if (insertError || !inserted) {
        console.error("Failed to insert announcement:", insertError);
        throw new HttpError(500, "Не вдалося зберегти новину");
      }

      // Формуємо повідомлення в чат бота в ТГ: нік старости + аудиторія + текст
      const authorTag = caller.username
        ? `@${caller.username} (${authorName})`
        : authorName;

      let audienceHeader = "оголошення для всіх";
      if (targetGroups.length > 0) {
        const labels = targetGroups.map((g) => GROUP_TITLE_MAP[g] || g).join(", ");
        audienceHeader = `оголошення для ${labels}`;
      }

      const tgText = `📢 Повідомлення від старости ${authorTag} (${audienceHeader}):\n\n${content}`;

      const notify = await broadcastStarostaMessage(
        supabase,
        tgText,
        photoUrls,
        targetGroups,
        caller.telegramId
      );

      if (notify.telegramMessages.length > 0) {
        const { data: updated } = await supabase
          .from("announcements")
          .update({ telegram_messages: notify.telegramMessages })
          .eq("id", inserted.id)
          .select("*")
          .single();
        if (updated) {
          return jsonResponse(200, {
            ok: true,
            announcement: updated,
            notify: { sent: notify.sent, failed: notify.failed },
          });
        }
      }

      return jsonResponse(200, {
        ok: true,
        announcement: inserted,
        notify: { sent: notify.sent, failed: notify.failed },
      });
    }

    if (action === "deactivate" || action === "delete") {
      const id = Number(body.id);
      if (!id || Number.isNaN(id)) {
        throw new HttpError(400, "Некоректний ID новини");
      }

      const { data: row } = await supabase
        .from("announcements")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      let tgDeleteStats = { deletedTgMessages: 0, failedTgMessages: 0 };
      if (row) {
        tgDeleteStats = await deleteAnnouncementTelegramMessagesAndAssets(supabase, row);
      }

      const { error: delError } = await supabase
        .from("announcements")
        .delete()
        .eq("id", id);

      if (delError) {
        throw new HttpError(500, "Не вдалося видалити новину");
      }

      return jsonResponse(200, {
        ok: true,
        id,
        ...tgDeleteStats,
      });
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
