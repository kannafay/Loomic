import { randomBytes } from "node:crypto";
import { expect, it } from "vitest";
import { decryptApiKey, encryptApiKey } from "./secrets.js";

it("encrypts keys with randomized authenticated ciphertext and rejects tampering", () => {
  const secret = randomBytes(32).toString("base64");
  const one = encryptApiKey("private-test-key", secret);
  const two = encryptApiKey("private-test-key", secret);
  expect(one).not.toContain("private-test-key");
  expect(one).not.toEqual(two);
  expect(decryptApiKey(one, secret)).toBe("private-test-key");
  expect(() =>
    decryptApiKey(one, randomBytes(32).toString("base64")),
  ).toThrow();
  const parts = one.split(":");
  parts[3] = Buffer.from("tampered").toString("base64");
  expect(() => decryptApiKey(parts.join(":"), secret)).toThrow();
});
