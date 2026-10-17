import { configureNetworkProxy } from "./config/network-proxy.js";

configureNetworkProxy();

import { buildApp } from "./app.js";
import { loadServerEnv } from "./config/env.js";

const env = loadServerEnv();
const app = buildApp({
  env,
});

const host = process.env.HOST ?? "127.0.0.1";

try {
  await app.listen({
    host,
    port: env.port,
  });

  console.log(`@loomic/server listening on http://${host}:${env.port}`);
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
