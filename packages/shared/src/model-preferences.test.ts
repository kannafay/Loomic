import { expect, it } from "vitest";
import {
  modelPreferencesSchema,
  resolvePreferredModel,
} from "./model-preferences.js";

it("keeps automatic preferences unset and never resolves a disabled explicit model to another model", () => {
  expect(modelPreferencesSchema.parse({})).toEqual({
    text: null,
    audio: null,
    image: null,
    video: null,
  });
  const models = [
    { id: "first", isDefault: false },
    { id: "admin-default", isDefault: true },
  ];
  expect(resolvePreferredModel(models, null)?.id).toBe("first");
  expect(resolvePreferredModel(models, "admin-default")?.id).toBe(
    "admin-default",
  );
  expect(resolvePreferredModel(models, "disabled")).toBeUndefined();
  expect(resolvePreferredModel([], null)).toBeUndefined();
});
