import { afterEach, expect, it, vi } from "vitest";
import { clearProviders, registerImageProvider } from "../../../generation/providers/registry.js";
import { getExecutor, type ExecutorContext } from "../job-executor.js";
import "./image-generation.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jKu0AAAAASUVORK5CYII=", "base64");
afterEach(clearProviders);
function setup(userId: string) {
  const generate = vi.fn(async () => ({ url: `data:image/png;base64,${png.toString("base64")}`, width: 1, height: 1, mimeType: "image/png" }));
  registerImageProvider({ name: "test", models: [{ id: "test/model", displayName: "Test", description: "" }], generate });
  const upload = vi.fn(async (_path: string, _bytes: Buffer, _options: unknown) => ({ error: null }));
  const from = vi.fn((table: string) => {
    if (table === "background_jobs") return { select: () => ({ eq: () => ({ single: async () => ({ data: { created_by: userId, workspace_id: "workspace", payload: { prompt: "test", model: "test/model" } } }) }) }) };
    if (table === "asset_objects") return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: "asset" }, error: null }) }) }) };
    throw Error(`Unexpected table: ${table}`);
  });
  const admin = { from, storage: { from: () => ({ upload, getPublicUrl: () => ({ data: { publicUrl: "https://example.test/result.png" } }) }) } };
  const resolve = vi.fn().mockResolvedValue({});
  const context = { getAdminClient: () => admin, renewVt: vi.fn(), modelConfigService: { resolve } } as unknown as ExecutorContext;
  return { context, generate, upload, from, resolve };
}
it.each(["administrator", "ordinary-user"])("preserves identical image bytes for %s without subscription checks or watermarks", async userId => {
  const { context, upload, from, resolve } = setup(userId);
  const result = await getExecutor("image_generation")!("job", {}, context);
  expect(result.asset_id).toBe("asset");
  expect(resolve).toHaveBeenCalledExactlyOnceWith("image", "test/model");
  expect(upload.mock.calls[0]?.[1]).toEqual(png);
  expect(from).not.toHaveBeenCalledWith("subscriptions");
});
it("rejects a disabled queued model before calling its provider", async () => {
  const { context, resolve, generate, upload } = setup("ordinary-user");
  resolve.mockRejectedValue(new Error("模型已停用"));
  await expect(getExecutor("image_generation")!("job", {}, context)).rejects.toThrow("模型已停用");
  expect(generate).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
});
