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

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Delete all photos from storage (recursive: files may be in subdirectories)
    try {
      // List root-level items
      const { data: rootFiles, error: rootErr } = await supabase.storage
        .from("board-photos")
        .list("", { limit: 1000 });

      if (!rootErr && rootFiles) {
        const allPaths: string[] = [];

        for (const item of rootFiles) {
          if (item.id === null) {
            // It's a folder — list its contents
            const { data: subFiles } = await supabase.storage
              .from("board-photos")
              .list(item.name, { limit: 1000 });

            if (subFiles) {
              for (const sub of subFiles) {
                allPaths.push(`${item.name}/${sub.name}`);
              }
            }
          } else {
            // It's a file
            allPaths.push(item.name);
          }
        }

        if (allPaths.length > 0) {
          await supabase.storage.from("board-photos").remove(allPaths);
        }
      }
    } catch (storageErr) {
      console.warn("Failed to clear storage:", storageErr);
      // Continue with DB cleanup even if storage fails
    }

    // Delete all board entries (cascades to reactions and comments via FK)
    const { error: deleteError } = await supabase
      .from("board_entries")
      .delete()
      .neq("id", 0);

    if (deleteError) {
      console.error("Failed to clear board:", deleteError);
      throw new HttpError(500, "Failed to clear board");
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
