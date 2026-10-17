import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

// Gemini function declarations use a scalar type and a nullable flag.
// Newer tool schemas can express the same nullable value as a type array.
function normalizeToolSchema<T>(tools: T): T {
  return JSON.parse(JSON.stringify(tools, (_key, value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const schema: Record<string, unknown> = { ...value };
    if (Array.isArray(schema.anyOf)) {
      const branches = schema.anyOf.filter((branch: { type?: unknown }) => branch.type !== "null");
      if (branches.length !== schema.anyOf.length) {
        schema.nullable = true;
        if (branches.length === 1) {
          delete schema.anyOf;
          Object.assign(schema, branches[0]);
        } else {
          schema.anyOf = branches;
        }
      }
    }
    if (Array.isArray(schema.type)) {
      const nullable = schema.type.includes("null");
      const types = schema.type.filter((type: unknown) => type !== "null");
      if (types.length <= 1) {
        schema.type = types[0] ?? "null";
      } else {
        delete schema.type;
        schema.anyOf = types.map((type: unknown) => ({ type }));
      }
      if (nullable) schema.nullable = true;
    }
    // The wire schema has inclusive bounds; tool-side validation retains strict bounds.
    if (typeof schema.exclusiveMinimum === "number") {
      const bound = schema.type === "integer"
        ? Math.floor(schema.exclusiveMinimum) + 1
        : schema.exclusiveMinimum;
      schema.minimum = Math.max(typeof schema.minimum === "number" ? schema.minimum : -Infinity, bound);
      delete schema.exclusiveMinimum;
    }
    if (typeof schema.exclusiveMaximum === "number") {
      const bound = schema.type === "integer"
        ? Math.ceil(schema.exclusiveMaximum) - 1
        : schema.exclusiveMaximum;
      schema.maximum = Math.min(typeof schema.maximum === "number" ? schema.maximum : Infinity, bound);
      delete schema.exclusiveMaximum;
    }
    return schema;
  }));
}

export class LoomicGoogleChatModel extends ChatGoogleGenerativeAI {
  override invocationParams(
    options?: Parameters<ChatGoogleGenerativeAI["invocationParams"]>[0],
  ): ReturnType<ChatGoogleGenerativeAI["invocationParams"]> {
    const params = super.invocationParams(options);
    return params.tools
      ? { ...params, tools: normalizeToolSchema(params.tools) }
      : params;
  }
}
