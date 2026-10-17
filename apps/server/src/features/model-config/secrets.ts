import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function encryptionKey(secret: string): Buffer {
  const key = Buffer.from(secret, "base64");
  if (key.length !== 32)
    throw new Error("LOOMIC_CONFIG_SECRET 必须是 32 字节的 Base64 密钥。");
  return key;
}
export function encryptApiKey(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}
export function decryptApiKey(value: string, secret: string): string {
  const [version, iv, tag, ciphertext] = value.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext)
    throw new Error("模型密钥格式无效。");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(secret),
    Buffer.from(iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
