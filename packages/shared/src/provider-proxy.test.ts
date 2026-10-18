import { expect, it } from "vitest";
import {
  providerConnectionSchema,
  providerProxySchema,
  providerWriteSchema,
} from "./model-config-contracts.js";

it.each(["global", "direct"] as const)(
  "accepts %s without a proxy address",
  (mode) => {
    expect(providerProxySchema.parse({ mode })).toEqual({ mode, url: "" });
  },
);
it.each([
  "",
  "socks5://127.0.0.1:10808",
  "http://user:secret@proxy.test",
  "http://127.0.0.1:99999",
  "http://proxy.test/path",
  "http://proxy.test?key=secret",
])("rejects an invalid custom proxy without exposing its address", (url) => {
  const parsed = providerProxySchema.safeParse({ mode: "custom", url });
  expect(parsed.success).toBe(false);
  if (!parsed.success)
    expect(parsed.error.issues[0]?.message).toBe(
      "请填写 HTTP 代理地址，例如 http://127.0.0.1:10808",
    );
});
it("preserves proxy settings in saved providers and unsaved connection tests", () => {
  const value = {
    name: "测试",
    category: "custom",
    preset: "custom",
    protocol: "openai",
    baseUrl: "http://localhost:9999/v1",
    proxy: { mode: "custom", url: " http://127.0.0.1:10808 " },
  };
  const saved = providerWriteSchema.parse(value);
  expect(saved.proxy?.url).toBe("http://127.0.0.1:10808");
  expect(providerConnectionSchema.parse(value).proxy).toEqual(saved.proxy);
});
