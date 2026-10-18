import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AdminSupabaseClient } from "../../supabase/admin.js";
import { createModelConfigService } from "./model-config-service.js";
import { encryptApiKey } from "./secrets.js";

function setup() {
  const secret = randomBytes(32).toString("base64");
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { api_key_ciphertext: encryptApiKey("private-test-key", secret) },
      error: null,
    }),
  };
  const from = vi.fn(() => query);
  const service = createModelConfigService({
    getAdminClient: () => ({ from }) as unknown as AdminSupabaseClient,
    secret,
  });
  const role = vi.spyOn(service, "role").mockResolvedValue("admin");
  return { service, role, query, from };
}

describe("saved provider API keys", () => {
  it("reads only the requested encrypted key and decrypts it for an administrator", async () => {
    const { service, role, query, from } = setup();
    expect(await service.revealProviderApiKey("admin", "provider-id")).toEqual({
      apiKey: "private-test-key",
    });
    expect(role).toHaveBeenCalledWith("admin");
    expect(from).toHaveBeenCalledExactlyOnceWith("model_providers");
    expect(query.select).toHaveBeenCalledWith("api_key_ciphertext");
    expect(query.eq).toHaveBeenCalledWith("id", "provider-id");
  });
  it("checks the role before querying any secret", async () => {
    const { service, role, from } = setup();
    role.mockResolvedValue("user");
    await expect(
      service.revealProviderApiKey("ordinary", "provider-id"),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(from).not.toHaveBeenCalled();
  });
  it.each([
    [{ data: null, error: null }, 404],
    [{ data: null, error: { code: "db_unavailable" } }, 503],
  ])(
    "distinguishes missing providers from database failures",
    async (result, statusCode) => {
      const { service, query } = setup();
      query.maybeSingle.mockResolvedValueOnce(result);
      await expect(
        service.revealProviderApiKey("admin", "provider-id"),
      ).rejects.toMatchObject({ statusCode });
    },
  );
  it("returns an empty key for a provider that does not require one", async () => {
    const { service, query } = setup();
    query.maybeSingle.mockResolvedValueOnce({
      data: { api_key_ciphertext: "" },
      error: null,
    });
    expect(await service.revealProviderApiKey("admin", "provider-id")).toEqual({
      apiKey: "",
    });
  });
  it("sanitizes decryption failures", async () => {
    const { service, query } = setup();
    query.maybeSingle.mockResolvedValueOnce({
      data: { api_key_ciphertext: "invalid-private-fixture" },
      error: null,
    });
    await expect(
      service.revealProviderApiKey("admin", "provider-id"),
    ).rejects.toMatchObject({
      statusCode: 500,
      message: "密钥读取失败，请重试。",
    });
  });
});
