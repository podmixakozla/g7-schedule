import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_TELEGRAM_ID = Deno.env.get("ADMIN_TELEGRAM_ID")!;

export interface AdminUser {
  userId: string;
  telegramId: number;
  isAdmin: boolean;
}

export async function verifyAdmin(
  req: Request
): Promise<AdminUser> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new HttpError(401, "Missing or invalid Authorization header");
  }

  const token = authHeader.replace("Bearer ", "");

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);

  if (userError || !user) {
    throw new HttpError(401, "Invalid or expired token");
  }

  const { data: telegramUser, error: telegramError } = await supabase
    .from("telegram_users")
    .select("telegram_id")
    .eq("id", user.id)
    .single();

  if (telegramError || !telegramUser) {
    throw new HttpError(403, "Telegram profile not linked");
  }

  const isAdmin = String(telegramUser.telegram_id) === ADMIN_TELEGRAM_ID;

  return {
    userId: user.id,
    telegramId: telegramUser.telegram_id,
    isAdmin,
  };
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}
