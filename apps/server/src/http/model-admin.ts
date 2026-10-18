import {
  adminUserCreateSchema,
  adminUserUpdateSchema,
  configuredModelWriteSchema,
  discoveredModelImportSchema,
  networkSettingsSchema,
  providerConnectionSchema,
  providerCreationSchema,
  providerWriteSchema,
  systemRoleSchema,
} from "@loomic/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  ModelConfigError,
  type ModelConfigService,
} from "../features/model-config/model-config-service.js";
import type { RequestAuthenticator } from "../supabase/user.js";

export async function registerModelAdminRoutes(
  app: FastifyInstance,
  options: { auth: RequestAuthenticator; service: ModelConfigService },
) {
  const { service, auth } = options;
  async function run(
    request: FastifyRequest,
    reply: FastifyReply,
    admin: boolean,
    fn: (userId: string) => Promise<unknown>,
    messages = {
      invalid: "请检查必填项、接口地址和模型参数。",
      failed: "模型配置处理失败，请稍后重试。",
    },
  ) {
    try {
      const user = await auth.authenticate(request);
      if (!user)
        return reply
          .code(401)
          .send({ error: { code: "unauthorized", message: "请先登录。" } });
      if (admin) await service.requireAdmin(user.id);
      const result = await fn(user.id);
      return reply.code(200).send(result ?? { ok: true });
    } catch (error) {
      if (error instanceof ModelConfigError)
        return reply.code(error.statusCode).send({
          error: { code: "model_config_error", message: error.message },
        });
      if (error && typeof error === "object" && "issues" in error)
        return reply.code(400).send({
          error: {
            code: "invalid_input",
            message: messages.invalid,
          },
        });
      return reply.code(500).send({
        error: {
          code: "model_config_error",
          message: messages.failed,
        },
      });
    }
  }
  app.get("/api/access", (request, reply) =>
    run(request, reply, false, async (userId) => ({
      role: await service.role(userId),
    })),
  );
  app.get("/api/admin/models", (request, reply) =>
    run(request, reply, true, () => service.list()),
  );
  app.post("/api/admin/providers", (request, reply) =>
    run(request, reply, true, (userId) =>
      service.saveProvider(userId, providerWriteSchema.parse(request.body)),
    ),
  );
  app.post<{ Params: { id: string } }>(
    "/api/admin/providers/:id/api-key",
    (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return run(request, reply, true, (userId) =>
        service.revealProviderApiKey(
          userId,
          z.string().uuid().parse(request.params.id),
        ),
      );
    },
  );
  app.post(
    "/api/admin/providers/create-with-models",
    { bodyLimit: 4 * 1024 * 1024 },
    (request, reply) =>
      run(request, reply, true, (userId) =>
        service.createProviderWithModels(
          userId,
          providerCreationSchema.parse(request.body),
        ),
      ),
  );
  app.post("/api/admin/providers/discover-models", (request, reply) =>
    run(request, reply, true, (userId) =>
      service.discoverDraftModels(
        userId,
        providerConnectionSchema.parse(request.body),
      ),
    ),
  );
  app.post("/api/admin/providers/test-connection", (request, reply) =>
    run(request, reply, true, (userId) =>
      service.testProviderConnection(
        userId,
        providerConnectionSchema.parse(request.body),
      ),
    ),
  );
  app.get("/api/admin/network", (request, reply) =>
    run(request, reply, true, () => service.networkSettings()),
  );
  app.put("/api/admin/network", (request, reply) =>
    run(request, reply, true, (userId) =>
      service.saveNetworkSettings(
        userId,
        networkSettingsSchema.parse(request.body),
      ),
    ),
  );
  app.put<{ Params: { id: string } }>(
    "/api/admin/providers/:id",
    (request, reply) =>
      run(request, reply, true, (userId) =>
        service.saveProvider(
          userId,
          providerWriteSchema.parse(request.body),
          z.string().uuid().parse(request.params.id),
        ),
      ),
  );
  app.get<{ Params: { id: string } }>(
    "/api/admin/providers/:id/discover-models",
    (request, reply) =>
      run(request, reply, true, (userId) =>
        service.discoverModels(
          userId,
          z.string().uuid().parse(request.params.id),
        ),
      ),
  );
  app.post<{ Params: { id: string } }>(
    "/api/admin/providers/:id/import-discovered-models",
    { bodyLimit: 4 * 1024 * 1024 },
    (request, reply) =>
      run(request, reply, true, (userId) =>
        service.importDiscoveredModels(
          userId,
          z.string().uuid().parse(request.params.id),
          discoveredModelImportSchema.parse(request.body),
        ),
      ),
  );
  app.post("/api/admin/models", (request, reply) =>
    run(request, reply, true, (userId) =>
      service.saveModel(userId, configuredModelWriteSchema.parse(request.body)),
    ),
  );
  app.post<{ Params: { id: string } }>(
    "/api/admin/providers/:id/import-models",
    (request, reply) =>
      run(request, reply, true, (userId) =>
        service.importPresetModels(
          userId,
          z.string().uuid().parse(request.params.id),
        ),
      ),
  );
  app.put<{ Params: { id: string } }>(
    "/api/admin/models/:id",
    (request, reply) =>
      run(request, reply, true, (userId) =>
        service.saveModel(
          userId,
          configuredModelWriteSchema.parse(request.body),
          z.string().uuid().parse(request.params.id),
        ),
      ),
  );
  app.post<{ Params: { id: string } }>(
    "/api/admin/models/:id/default",
    (request, reply) =>
      run(request, reply, true, (userId) =>
        service.setDefault(userId, z.string().uuid().parse(request.params.id)),
      ),
  );
  app.get("/api/admin/users", (request, reply) =>
    run(request, reply, true, async (userId) => ({
      users: await service.users(userId),
    })),
  );
  const userMessages = {
    invalid: "请检查姓名、邮箱、初始密码与角色。",
    failed: "用户信息处理失败，请稍后重试。",
  };
  app.post("/api/admin/users", (request, reply) => {
    reply.header("Cache-Control", "no-store");
    return run(
      request,
      reply,
      true,
      async (userId) => ({
        user: await service.createUser(
          userId,
          adminUserCreateSchema.parse(request.body),
        ),
      }),
      userMessages,
    );
  });
  app.put<{ Params: { id: string } }>(
    "/api/admin/users/:id",
    (request, reply) => {
      reply.header("Cache-Control", "no-store");
      return run(
        request,
        reply,
        true,
        async (userId) => ({
          user: await service.updateUser(
            userId,
            z.string().uuid().parse(request.params.id),
            adminUserUpdateSchema.parse(request.body),
          ),
        }),
        userMessages,
      );
    },
  );
  app.put<{ Params: { id: string } }>(
    "/api/admin/users/:id/role",
    (request, reply) =>
      run(request, reply, true, (userId) =>
        service.setRole(
          userId,
          z.string().uuid().parse(request.params.id),
          systemRoleSchema.parse((request.body as { role?: unknown })?.role),
        ),
      ),
  );
}
