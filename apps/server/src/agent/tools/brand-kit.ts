import { tool } from "langchain";
import { z } from "zod";
import type { UserSupabaseClient } from "../../supabase/user.js";

const brandKitSchema = z.object({});

export function createBrandKitTool(
  deps: { createUserClient: (accessToken: string) => UserSupabaseClient },
  brandKitId: string,
) {
  return tool(
    async (_input, config) => {
      const accessToken = config?.configurable?.access_token;
      if (!accessToken) {
        return JSON.stringify({ error: "No access token available" });
      }

      const client = deps.createUserClient(accessToken);

      // Fetch kit
      const { data: kit } = await client
        .from("brand_kits")
        .select("id, name, guidance_text")
        .eq("id", brandKitId)
        .maybeSingle();

      if (!kit) {
        return JSON.stringify({ error: "Brand kit not found" });
      }

      // Fetch assets
      const { data: assets } = await client
        .from("brand_kit_assets")
        .select(
          "id, asset_type, display_name, role, text_content, file_url, metadata",
        )
        .eq("kit_id", brandKitId)
        .order("sort_order", { ascending: true });

      const safeAssets = assets ?? [];

      // Resolve signed URLs for file-based assets (logo/image)
      const fileAssets = safeAssets.filter(
        (a): a is typeof a & { file_url: string } =>
          typeof a.file_url === "string" && a.file_url.length > 0,
      );
      if (fileAssets.length > 0) {
        const paths = fileAssets.map((a) => a.file_url as string);
        const { data: signedData } = await client.storage
          .from("brand-kit-assets")
          .createSignedUrls(paths, 3600);

        if (signedData) {
          const urlByPath = new Map(
            signedData
              .filter((e) => e.signedUrl && e.path)
              .map((e) => [e.path, e.signedUrl]),
          );
          for (const asset of fileAssets) {
            const url = urlByPath.get(asset.file_url);
            if (url) asset.file_url = url;
          }
        }
      }

      const result = {
        kit_name: kit.name,
        design_guidance: kit.guidance_text ?? "",
        colors: safeAssets
          .filter((a) => a.asset_type === "color")
          .map((a) => ({
            id: a.id,
            name: a.display_name,
            hex: a.text_content,
            role: a.role,
          })),
        fonts: safeAssets
          .filter((a) => a.asset_type === "font")
          .map((a) => ({
            id: a.id,
            name: a.display_name,
            family: a.text_content,
            weight:
              (a.metadata &&
              typeof a.metadata === "object" &&
              !Array.isArray(a.metadata)
                ? a.metadata.weight
                : undefined) ?? "400",
            role: a.role,
          })),
        logos: safeAssets
          .filter((a) => a.asset_type === "logo")
          .map((a) => ({
            id: a.id,
            name: a.display_name,
            url: a.file_url,
            role: a.role,
          })),
        images: safeAssets
          .filter((a) => a.asset_type === "image")
          .map((a) => ({
            id: a.id,
            name: a.display_name,
            url: a.file_url,
          })),
      };

      return JSON.stringify(result, null, 2);
    },
    {
      name: "get_brand_kit",
      description:
        "查询当前项目绑定的品牌套件信息，包含设计指南、颜色、字体、Logo等品牌资产。当用户提到品牌、风格、设计规范时使用此工具。",
      schema: brandKitSchema,
    },
  );
}
