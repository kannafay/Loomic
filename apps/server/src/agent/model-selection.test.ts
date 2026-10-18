import { afterEach, expect, it, vi } from "vitest";
import type { AvailableModel } from "../generation/providers/registry.js";
import { selectedGenerationModels } from "./model-selection.js";
import { createImageGenerateTool } from "./tools/image-generate.js";

const models: [AvailableModel, AvailableModel] = [
  {
    id: "google-official/gemini-3.1-flash-image-preview",
    provider: "google",
    displayName: "Gemini",
    description: "",
  },
  {
    id: "agnes/agnes-image-2.5-flash",
    provider: "agnes",
    displayName: "Agnes Image 2.5 Flash",
    description: "",
  },
];
afterEach(() => vi.restoreAllMocks());

it("uses the personal generation default or the first model while preserving independent explicit assistant choices", () => {
  expect(selectedGenerationModels(models, undefined, [], null)).toEqual([
    models[0],
  ]);
  expect(selectedGenerationModels(models, undefined, [], models[1].id)).toEqual(
    [models[1]],
  );
  expect(
    selectedGenerationModels(
      models,
      { mode: "manual", models: [models[0].id] },
      [],
      models[1].id,
    ),
  ).toEqual([models[0]]);
  expect(
    selectedGenerationModels(
      models,
      { mode: "manual", models: models.map((m) => m.id) },
      [],
      models[1].id,
    ),
  ).toEqual(models);
  expect(selectedGenerationModels(models, undefined, [], "disabled")).toEqual(
    [],
  );
});

it("restricts manual image selection to Agnes and rejects a Google tool call", async () => {
  const selected = selectedGenerationModels(models, {
    mode: "manual",
    models: [models[1].id],
  });
  const submit = vi.fn().mockResolvedValue({
    jobId: "job-1",
    imageUrl: "https://example.test/image.png",
    width: 1,
    height: 1,
  });
  const tool = createImageGenerateTool({
    availableModels: selected,
    submitImageJob: submit,
  });
  await expect(
    tool.invoke({ title: "雪山", prompt: "雪山日出", model: models[0]?.id }),
  ).rejects.toThrow();
  expect(submit).not.toHaveBeenCalled();
  await tool.invoke({
    title: "雪山",
    prompt: "雪山日出",
    model: models[1].id,
  });
  expect(submit).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ model: models[1].id }),
  );
});
it("does not silently fall back when a selected model has been disabled", () => {
  expect(() =>
    selectedGenerationModels([], { mode: "manual", models: [models[1]?.id] }),
  ).toThrow("已停用");
});
it("honors an explicit model mention within the enabled catalog", () => {
  expect(
    selectedGenerationModels(models, undefined, [
      { mentionType: "image-model", id: models[1]?.id, label: "Agnes" },
    ]),
  ).toEqual([models[1]]);
});
