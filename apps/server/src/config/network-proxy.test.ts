import { once } from "node:events";
import http from "node:http";
import { type Server, createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { EnvHttpProxyAgent, fetch } from "undici";
import { describe, expect, it } from "vitest";

import {
  applyNetworkProxy,
  resolveProxyConfiguration,
} from "./network-proxy.js";

async function listen(server: Server): Promise<AddressInfo> {
  server.listen(0);
  await once(server, "listening");
  return server.address() as AddressInfo;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

describe("outbound proxy configuration", () => {
  it("keeps proxy support disabled without a proxy address", () => {
    expect(resolveProxyConfiguration({})).toBeNull();
  });

  it("prioritizes the project proxy and preserves local and custom exclusions", () => {
    expect(
      resolveProxyConfiguration({
        GLOBAL_AGENT_HTTP_PROXY: " http://127.0.0.1:10808/ ",
        HTTPS_PROXY: "http://other-proxy.test:7890",
        NO_PROXY: "internal.test,localhost",
      }),
    ).toEqual({
      httpProxy: "http://127.0.0.1:10808",
      httpsProxy: "http://127.0.0.1:10808",
      noProxy: "localhost,127.0.0.1,[::1],host.docker.internal,internal.test",
    });
  });

  it("supports an HTTPS-only destination proxy without proxying HTTP destinations", () => {
    expect(
      resolveProxyConfiguration({ https_proxy: "http://127.0.0.1:10808" }),
    ).toEqual({
      httpsProxy: "http://127.0.0.1:10808",
      noProxy: "localhost,127.0.0.1,[::1],host.docker.internal",
    });
  });

  it("rejects unsupported proxy transports without exposing credentials", () => {
    expect(() =>
      resolveProxyConfiguration({
        HTTP_PROXY: "socks5://name:secret@127.0.0.1:10808",
      }),
    ).toThrow("代理地址必须是 HTTP 代理，例如 http://127.0.0.1:10808。");
  });

  it("keeps loopback requests working even when the external proxy is unreachable", async () => {
    const local = createServer((_request, response) =>
      response.end("local service"),
    );
    const address = await listen(local);
    const configuration = resolveProxyConfiguration({
      GLOBAL_AGENT_HTTP_PROXY: "http://127.0.0.1:1",
    });
    if (!configuration) throw new Error("Expected proxy configuration");
    const dispatcher = new EnvHttpProxyAgent(configuration);
    try {
      const hosts = [
        "127.0.0.1",
        "localhost",
        ...(address.family === "IPv6" ? ["[::1]"] : []),
      ];
      for (const host of hosts) {
        const response = await fetch(`http://${host}:${address.port}`, {
          dispatcher,
        });
        expect(await response.text()).toBe("local service");
      }
    } finally {
      await dispatcher.close();
      await close(local);
    }
  });

  it("routes external destinations through the configured HTTP CONNECT proxy", async () => {
    const destinations: string[] = [];
    const proxy = createServer();
    proxy.on("connect", (request, socket) => {
      destinations.push(request.url ?? "");
      socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      socket.once("data", () =>
        socket.end(
          "HTTP/1.1 200 OK\r\nContent-Length: 7\r\nConnection: close\r\n\r\nproxied",
        ),
      );
    });
    const address = await listen(proxy);
    const configuration = resolveProxyConfiguration({
      GLOBAL_AGENT_HTTP_PROXY: `http://127.0.0.1:${address.port}`,
    });
    if (!configuration) throw new Error("Expected proxy configuration");
    const dispatcher = new EnvHttpProxyAgent(configuration);
    try {
      const response = await fetch(
        "http://external-proxy-check.invalid/check",
        { dispatcher },
      );
      expect(await response.text()).toBe("proxied");
      expect(destinations).toEqual(["external-proxy-check.invalid:80"]);
    } finally {
      await dispatcher.close();
      await close(proxy);
    }
  });
  it("hot switches both native fetch and SDK http clients, then disables proxying while preserving local access", async () => {
    const makeProxy = (name: string) => {
      const server = createServer((_request, response) => response.end(name));
      server.on("connect", (_request, socket) => {
        socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        socket.once("data", () =>
          socket.end(
            `HTTP/1.1 200 OK\r\nContent-Length: ${name.length}\r\nConnection: close\r\n\r\n${name}`,
          ),
        );
      });
      return server;
    };
    const first = makeProxy("first");
    const second = makeProxy("second");
    const local = createServer((_request, response) => response.end("local"));
    const firstAddress = await listen(first);
    const secondAddress = await listen(second);
    const localAddress = await listen(local);
    const classic = (url: string) =>
      new Promise<string>((resolve, reject) => {
        http
          .get(url, (response) => {
            let text = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => {
              text += chunk;
            });
            response.on("end", () => resolve(text));
          })
          .on("error", reject);
      });
    try {
      for (const [port, expected] of [
        [firstAddress.port, "first"],
        [secondAddress.port, "second"],
      ] as const) {
        applyNetworkProxy(
          resolveProxyConfiguration({
            GLOBAL_AGENT_HTTP_PROXY: `http://127.0.0.1:${port}`,
          }),
        );
        expect(
          await (
            await globalThis.fetch("http://proxy-switch-check.invalid/check")
          ).text(),
        ).toBe(expected);
        expect(await classic("http://proxy-switch-check.invalid/check")).toBe(
          expected,
        );
        expect(await classic(`http://127.0.0.1:${localAddress.port}`)).toBe(
          "local",
        );
      }
      applyNetworkProxy(null);
      expect(
        await (
          await globalThis.fetch(`http://127.0.0.1:${localAddress.port}`)
        ).text(),
      ).toBe("local");
      expect(await classic(`http://127.0.0.1:${localAddress.port}`)).toBe(
        "local",
      );
    } finally {
      applyNetworkProxy(null);
      await Promise.all([close(first), close(second), close(local)]);
    }
  });
});
