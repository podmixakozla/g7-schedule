import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAdmin, HttpError, jsonResponse } from "../_shared/verify-admin.ts";

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

    const { post_id } = await req.json();
    if (!post_id) {
      throw new HttpError(400, "post_id is required");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch the post to get photo_url before deleting
    const { data: post, error: fetchError } = await supabase
      .from("board_entries")
      .select("id, photo_url")
      .eq("id", post_id)
      .single();

    if (fetchError || !post) {
      throw new HttpError(404, "Post not found");
    }

    // Delete photo from storage if exists
    if (post.photo_url) {
      try {
        // Extract the file path from the URL
        // Storage URLs look like: https://...supabase.co/storage/v1/object/public/board-photos/filename
        const urlParts = post.photo_url.split("/");
        const bucketIndex = urlParts.indexOf("board-photos");
        if (bucketIndex !== -1) {
          const filePath = urlParts.slice(bucketIndex + 1).join("/");
          await supabase.storage.from("board-photos").remove([filePath]);
        }
      } catch (storageErr) {
        console.warn("Failed to delete photo from storage:", storageErr);
        // Continue with DB deletion even if storage cleanup fails
      }
    }

    // Delete the post (cascades to reactions and comments via FK)
    const { error: deleteError } = await supabase
      .from("board_entries")
      .delete()
      .eq("id", post_id);

    if (deleteError) {
      console.error("Failed to delete post:", deleteError);
      throw new HttpError(500, "Failed to delete post");
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
