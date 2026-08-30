import { verifyAdmin, HttpError, jsonResponse } from "../_shared/verify-admin.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    const admin = await verifyAdmin(req);
    if (!admin.isAdmin) {
      throw new HttpError(403, "Admin access required");
    }

    const { comment_id } = await req.json();
    if (!comment_id) {
      throw new HttpError(400, "comment_id is required");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify comment exists
    const { data: comment, error: fetchError } = await supabase
      .from("comments")
      .select("id")
      .eq("id", comment_id)
      .single();

    if (fetchError || !comment) {
      throw new HttpError(404, "Comment not found");
    }

    // Delete the comment
    const { error: deleteError } = await supabase
      .from("comments")
      .delete()
      .eq("id", comment_id);

    if (deleteError) {
      console.error("Failed to delete comment:", deleteError);
      throw new HttpError(500, "Failed to delete comment");
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
