"use client";

import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Checkbox } from "@/components/ui/checkbox";

import {
  fetchNetworkSettings,
  saveNetworkSettings,
} from "@/lib/model-admin-api";
import { type NetworkSettings, networkSettingsSchema } from "@loomic/shared";
import { useEffect, useState } from "react";

export function NetworkSettingsPanel({ token }: { token: string }) {
  const { success, error: showError } = useToast();
  const [value, setValue] = useState<NetworkSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let canceled = false;
    void fetchNetworkSettings(token)
      .then((result) => {
        if (!canceled) setValue(result);
      })
      .catch((err) => {
        if (!canceled)
          setError(err instanceof Error ? err.message : "网络设置读取失败。");
      });
    return () => {
      canceled = true;
    };
  }, [token]);
  return (
    <section className="max-w-xl">
      <h2 className="mb-1 text-lg font-semibold">网络设置</h2>
      <p className="mb-6 text-sm text-muted-foreground">
        管理模型服务的全局代理，所有用户统一生效。
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!value ? (
        !error && (
          <p className="mt-5 text-sm text-muted-foreground">
            正在读取网络设置…
          </p>
        )
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            const parsed = networkSettingsSchema.safeParse(value);
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? "请检查代理配置。");
              return;
            }
            setBusy(true);
            void saveNetworkSettings(token, parsed.data)
              .then((result) => {
                setValue(result);
                success(
                  "全局代理已保存。API 立即生效，后台任务在下次请求时自动更新。",
                );
              })
              .catch((err) =>
                showError(
                  err instanceof Error ? err.message : "网络设置保存失败。",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <label
            htmlFor="global-proxy-enabled"
            className="flex items-center gap-2 text-sm"
          >
            <Checkbox
              id="global-proxy-enabled"
              aria-label="启用全局代理"
              checked={value.enabled}
              disabled={busy}
              onCheckedChange={(checked) =>
                setValue({ ...value, enabled: checked })
              }
            />
            启用全局代理
          </label>
          <label
            htmlFor="network-settings-panel-value-proxy-url"
            className="block space-y-1.5 text-sm"
          >
            <span>代理地址</span>
            <Input
              id="network-settings-panel-value-proxy-url"
              type="url"
              value={value.proxyUrl}
              required={value.enabled}
              disabled={busy}
              placeholder="http://127.0.0.1:10808"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) =>
                setValue({ ...value, proxyUrl: event.target.value })
              }
            />
          </label>
          <label
            htmlFor="network-settings-panel-value-no-proxy"
            className="block space-y-1.5 text-sm"
          >
            <span>额外直连地址</span>
            <Input
              id="network-settings-panel-value-no-proxy"
              value={value.noProxy}
              disabled={busy}
              placeholder="internal.example.com,host.docker.internal"
              spellCheck={false}
              onChange={(event) =>
                setValue({ ...value, noProxy: event.target.value })
              }
            />
            <p className="text-xs text-muted-foreground">
              本地地址自动直连；其他域名或 IP 用逗号分隔。
            </p>
          </label>
          <Button variant="default" type="submit" size="sm" disabled={busy}>
            {busy ? "正在保存…" : "保存网络设置"}
          </Button>
        </form>
      )}
    </section>
  );
}
