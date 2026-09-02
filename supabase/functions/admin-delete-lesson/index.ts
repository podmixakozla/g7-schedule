import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdmin, HttpError, jsonResponse } from "../_shared/verify-admin.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VALID_GROUPS = ["AR-26-1", "AR-26sk-1"];

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
    const user = await verifyAdmin(req);

    const body = await req.json();
    const { day_of_week, pair_number, group_code } = body;

    if (day_of_week === undefined || pair_number === undefined) {
      throw new HttpError(400, "day_of_week and pair_number are required");
    }

    const resolvedGroup = group_code || "AR-26-1";
    if (!VALID_GROUPS.includes(resolvedGroup)) {
      throw new HttpError(400, "group_code must be AR-26-1 or AR-26sk-1");
    }

    // Permission check:
    // - AR-26-1: admin only
    // - AR-26sk-1: any authenticated user
    if (resolvedGroup === "AR-26-1" && !user.isAdmin) {
      throw new HttpError(403, "Only admin can modify АР-26-1 schedule");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from("schedule_lessons")
      .delete()
      .eq("day_of_week", Number(day_of_week))
      .eq("pair_number", Number(pair_number))
      .eq("group_code", resolvedGroup);

    if (error) {
      console.error("Failed to delete lesson:", error);
      throw new HttpError(500, "Failed to delete lesson");
    }

    return jsonResponse(200, { success: true });
  } catch (err) {
    if (err instanceof HttpError) {
      return jsonResponse(err.status, { error: err.message });
    }
    console.error("Unexpected error:", err);
    return jsonResponse(500, { error: "Internal server error" });
  }
});
