import { AsyncLocalStorage } from "node:async_hooks";
import { type ProviderProxy, providerProxySchema } from "@loomic/shared";
import { bootstrap } from "global-agent";
import {
  Agent,
  Dispatcher,
  EnvHttpProxyAgent,
  getGlobalDispatcher,
  setGlobalDispatcher,
} from "undici";

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]", "host.docker.internal"];

export type ProxyConfiguration = {
  httpProxy?: string;
  httpsProxy?: string;
  noProxy: string;
};
let activeConfiguration: string | undefined;
let managedDispatcher: Dispatcher | undefined;
const providerDispatchers = new Map<string, Dispatcher>();
const providerScope = new AsyncLocalStorage<Dispatcher | null>();
let routingDispatcher: Dispatcher | undefined;

function installProviderRouting(): void {
  if (!routingDispatcher) {
    const initial = getGlobalDispatcher();
    routingDispatcher = new (class extends Dispatcher {
      override dispatch(
        options: Dispatcher.DispatchOptions,
        handler: Dispatcher.DispatchHandler,
      ) {
        return (
          providerScope.getStore() ??
          managedDispatcher ??
          initial
        ).dispatch(options, handler);
      }
    })();
  }
  if (getGlobalDispatcher() !== routingDispatcher)
    setGlobalDispatcher(routingDispatcher);
}

export function withProviderProxy<T>(
  proxy: ProviderProxy | undefined,
  execute: () => T,
): T {
  const value = proxy
    ? providerProxySchema.parse(proxy)
    : ({ mode: "global", url: "" } as const);
  installProviderRouting();
  if (value.mode === "global") return providerScope.run(null, execute);
  const key = value.mode === "direct" ? "direct" : value.url.replace(/\/$/, "");
  let dispatcher = providerDispatchers.get(key);
  if (!dispatcher) {
    dispatcher =
      value.mode === "direct"
        ? new Agent()
        : new EnvHttpProxyAgent({
            httpProxy: key,
            httpsProxy: key,
            noProxy: LOCAL_HOSTS.join(","),
          });
    providerDispatchers.set(key, dispatcher);
  }
  return providerScope.run(dispatcher, execute);
}

export async function* withProviderProxyStream<T>(
  proxy: ProviderProxy | undefined,
  stream: AsyncGenerator<T>,
): AsyncGenerator<T> {
  try {
    while (true) {
      const item = await withProviderProxy(proxy, () => stream.next());
      if (item.done) return;
      yield item.value;
    }
  } finally {
    await withProviderProxy(proxy, () => stream.return(undefined));
  }
}

export function providerFetch(proxy?: ProviderProxy): typeof globalThis.fetch {
  return (input, init) =>
    withProviderProxy(proxy, () => globalThis.fetch(input, init));
}
type ProxyController = {
  HTTP_PROXY: string | null;
  HTTPS_PROXY: string | null;
  NO_PROXY: string | null;
};

function optionalValue(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function validateProxy(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === "http:" &&
      url.hostname &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    ) {
      return url.toString().replace(/\/$/, "");
    }
  } catch {
    // Report the expected format without exposing proxy credentials.
  }
  throw new Error("代理地址必须是 HTTP 代理，例如 http://127.0.0.1:10808。");
}

export function resolveProxyConfiguration(
  source: NodeJS.ProcessEnv = process.env,
): ProxyConfiguration | null {
  const projectProxy = optionalValue(source.GLOBAL_AGENT_HTTP_PROXY);
  const httpProxy = validateProxy(
    projectProxy ??
      optionalValue(source.http_proxy) ??
      optionalValue(source.HTTP_PROXY),
  );
  const httpsProxy = validateProxy(
    optionalValue(source.GLOBAL_AGENT_HTTPS_PROXY) ??
      projectProxy ??
      optionalValue(source.https_proxy) ??
      optionalValue(source.HTTPS_PROXY) ??
      httpProxy,
  );
  if (!httpProxy && !httpsProxy) return null;

  const exclusions = [
    source.GLOBAL_AGENT_NO_PROXY,
    source.no_proxy,
    source.NO_PROXY,
  ].flatMap((value) => value?.split(/[,\s]+/).filter(Boolean) ?? []);
  const noProxy = [...new Set([...LOCAL_HOSTS, ...exclusions])].join(",");
  return {
    ...(httpProxy ? { httpProxy } : {}),
    ...(httpsProxy ? { httpsProxy } : {}),
    noProxy,
  };
}

export function configureNetworkProxy(): boolean {
  const configuration = resolveProxyConfiguration();
  if (!configuration) return false;
  applyNetworkProxy(configuration);
  return true;
}

export function applyNetworkProxy(
  configuration: ProxyConfiguration | null,
): void {
  const signature = JSON.stringify(configuration);
  if (signature === activeConfiguration) return;
  // SDKs using classic http(s) and native fetch must switch together.
  const runtime = globalThis as typeof globalThis & {
    GLOBAL_AGENT?: ProxyController;
  };
  if (!runtime.GLOBAL_AGENT) bootstrap();
  if (!runtime.GLOBAL_AGENT) throw new Error("代理初始化失败。");
  const proxy = runtime.GLOBAL_AGENT;
  proxy.HTTP_PROXY = configuration?.httpProxy ?? null;
  proxy.HTTPS_PROXY = configuration?.httpsProxy ?? null;
  proxy.NO_PROXY = configuration?.noProxy ?? LOCAL_HOSTS.join(",");
  process.env.GLOBAL_AGENT_HTTP_PROXY = proxy.HTTP_PROXY ?? "";
  process.env.GLOBAL_AGENT_HTTPS_PROXY = proxy.HTTPS_PROXY ?? "";
  process.env.GLOBAL_AGENT_NO_PROXY = proxy.NO_PROXY ?? "";
  const previous = managedDispatcher;
  managedDispatcher = configuration
    ? new EnvHttpProxyAgent({
        httpProxy: configuration.httpProxy ?? "",
        httpsProxy: configuration.httpsProxy ?? "",
        noProxy: configuration.noProxy,
      })
    : new Agent();
  installProviderRouting();
  activeConfiguration = signature;
  // Let in-flight responses finish while new requests use the new configuration.
  void previous?.close().catch(() => {});
}
