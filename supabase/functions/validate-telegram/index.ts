import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HttpError, jsonResponse } from "../_shared/verify-admin.ts";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TELEGRAM_ID = Deno.env.get("ADMIN_TELEGRAM_ID")!;

// HMAC-SHA256 helper using Web Crypto API
async function hmacSha256(key: CryptoKey, data: string): Promise<ArrayBuffer> {
  return await globalThis.crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
}

// Validate Telegram Mini App initData per official spec:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function validateInitData(
  initData: string,
  botToken: string
): Promise<Record<string, string>> {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) {
    throw new HttpError(403, "Invalid Telegram data: missing hash");
  }
  params.delete("hash");

  // Build data-check-string: sorted key=value pairs joined by \n
  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  // secret_key = HMAC_SHA256("WebAppData", bot_token)
  const encoder = new TextEncoder();
  const webAppDataKey = await globalThis.crypto.subtle.importKey(
    "raw",
    encoder.encode("WebAppData"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const secretKeyBuffer = await hmacSha256(webAppDataKey, botToken);

  // calculated_hash = HMAC_SHA256(data_check_string, secret_key)
  const hmacKey = await globalThis.crypto.subtle.importKey(
    "raw",
    secretKeyBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const calculatedHashBuffer = await hmacSha256(hmacKey, dataCheckString);

  // Convert to hex string for comparison
  const calculatedHashHex = Array.from(new Uint8Array(calculatedHashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (calculatedHashHex !== hash) {
    throw new HttpError(403, "Invalid Telegram data: hash mismatch");
  }

  // Check auth_date is not older than 5 minutes
  const authDate = Number(params.get("auth_date"));
  if (Date.now() / 1000 - authDate > 300) {
    throw new HttpError(403, "Telegram data expired (older than 5 minutes)");
  }

  // Return all validated parameters
  const result: Record<string, string> = {};
  params.forEach((v, k) => (result[k] = v));
  return result;
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
    const { initData } = await req.json();
    if (!initData) {
      throw new HttpError(400, "initData is required");
    }

    // Step 1: Validate HMAC signature + expiry
    const telegramData = await validateInitData(initData, BOT_TOKEN);

    const telegramId = Number(telegramData.id);
    const username = telegramData.username || null;
    const firstName = telegramData.first_name || null;
    const lastName = telegramData.last_name || null;
    const photoUrl = telegramData.photo_url || null;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Step 2: Check if this Telegram user already has a linked auth account
    const { data: existingTelegramUser } = await supabase
      .from("telegram_users")
      .select("id")
      .eq("telegram_id", telegramId)
      .single();

    let authUserId: string;

    if (existingTelegramUser) {
      // Existing user: update profile fields, reuse auth UUID
      authUserId = existingTelegramUser.id;

      await supabase
        .from("telegram_users")
        .update({
          username,
          first_name: firstName,
          last_name: lastName,
          photo_url: photoUrl,
        })
        .eq("id", authUserId);
    } else {
      // New user: create Supabase auth user, then link telegram profile
      const email = `telegram_${telegramId}@placeholder.local`;
      const { data: newUser, error: createError } =
        await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            telegram_id: telegramId,
            username,
            first_name: firstName,
          },
        });

      if (createError) {
        // email_exists = orphaned auth user from a prior partially-failed login.
        // Recover by listing users and matching email in JS.
        if (createError.code === "email_exists" || createError.status === 422) {
          let existingUser: { id: string } | null = null;
          let page = 1;
          const perPage = 100;
          while (true) {
            const { data: batch, error: listError } =
              await supabase.auth.admin.listUsers({ page, perPage });
            if (listError || !batch?.users?.length) break;
            existingUser = batch.users.find(
              (u: { email?: string }) => u.email === email
            ) as { id: string } | null;
            if (existingUser || batch.users.length < perPage) break;
            page++;
          }
          if (!existingUser) {
            console.error("email_exists but user not found via listUsers:", createError);
            throw new HttpError(500, "Failed to recover existing auth user");
          }
          authUserId = existingUser.id;
          console.log(`Recovered orphaned auth user ${authUserId} for telegram_id ${telegramId}`);
        } else {
          console.error("createUser error:", createError);
          throw new HttpError(500, "Failed to create auth user");
        }
      } else {
        authUserId = newUser.user.id;
      }

      // Self-healing: upsert telegram_users row (creates if missing, no-op if exists)
      const { error: insertError } = await supabase
        .from("telegram_users")
        .upsert({
          id: authUserId,
          telegram_id: telegramId,
          username,
          first_name: firstName,
          last_name: lastName,
          photo_url: photoUrl,
        }, { onConflict: "id" });

      if (insertError) {
        console.error("telegram_users upsert error:", insertError);
        throw new HttpError(500, "Failed to create Telegram profile");
      }
    }

    // Step 3: Generate a JWT access token for this auth user
    const { data: tokenData, error: tokenError } =
      await supabase.auth.admin.generateAccessToken({
        user_id: authUserId,
      });

    if (tokenError || !tokenData) {
      console.error("generateAccessToken error:", tokenError);
      throw new HttpError(500, "Failed to generate access token");
    }

    // Step 4: Compute admin flag server-side
    const isAdmin = String(telegramId) === ADMIN_TELEGRAM_ID;

    return jsonResponse(200, {
      session: {
        access_token: tokenData.access_token,
        token_type: "bearer",
      },
      user: {
        id: authUserId,
        telegram_id: telegramId,
        username,
        first_name: firstName,
        last_name: lastName,
        is_admin: isAdmin,
      },
    });
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse(err.status, { error: err.message });
    }
    console.error("Unexpected error:", err);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
