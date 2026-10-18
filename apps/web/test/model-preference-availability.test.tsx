import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ImageModelPreferencePopover } from "../src/components/image-model-preference";
import { Button } from "../src/components/ui/button";
import type { ImageModelInfo } from "../src/lib/server-api";

const { fetchImageModels, fetchVideoModels } = vi.hoisted(() => ({
  fetchImageModels: vi.fn(),
  fetchVideoModels: vi.fn(),
}));
vi.mock("../src/lib/server-api", () => ({
  fetchImageModels,
  fetchVideoModels,
}));

const imageModels: ImageModelInfo[] = [
  {
    id: "configured/google-image",
    displayName: "Nano Banana",
    description: "图片生成与编辑，支持多张参考图。",
    provider: "google",
    providerId: "google-primary",
    providerName: "Google 官方",
  },
  {
    id: "configured/agnes-image-2.5",
    displayName: "Agnes Image 2.5 Flash",
    description: "支持文字生成图片、图片编辑和多图融合，最高 4K。",
    provider: "agnes",
    providerId: "agnes-team",
    providerName: "团队 Agnes",
  },
  {
    id: "configured/agnes-image-2.1",
    displayName: "Agnes Image 2.1 Flash",
    description: "支持文字生成图片、图片编辑和多图融合。",
    provider: "agnes",
    providerId: "agnes-team",
    providerName: "团队 Agnes",
  },
];
const videoModels = [
  {
    id: "configured/veo",
    displayName: "Veo 3.1",
    description: "文字生成视频，支持首尾帧。",
    provider: "google",
    providerId: "google-primary",
    providerName: "Google 官方",
  },
];

function renderSelector() {
  return render(
    <ImageModelPreferencePopover open onOpenChange={() => {}}>
      <Button>生成模型偏好</Button>
    </ImageModelPreferencePopover>,
  );
}

function saveImagePreference(mode: "auto" | "manual", models: string[]) {
  localStorage.setItem(
    "loomic:image-model-preference",
    JSON.stringify({ mode, models }),
  );
}

async function chooseMode(
  user: ReturnType<typeof userEvent.setup>,
  mode: "auto" | "manual",
) {
  await user.click(screen.getByRole("combobox", { name: /模型选择方式$/ }));
  await user.click(
    await screen.findByRole("option", {
      name: mode === "manual" ? "限定模型（可多选）" : "自动选择",
    }),
  );
}

beforeEach(() => {
  vi.stubGlobal("PointerEvent", MouseEvent);
  fetchImageModels.mockReset().mockResolvedValue({ models: imageModels });
  fetchVideoModels.mockReset().mockResolvedValue({ models: videoModels });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
it("replaces a previously disabled selection when the user chooses an enabled model", async () => {
  localStorage.setItem(
    "loomic:image-model-preference",
    JSON.stringify({ mode: "manual", models: ["disabled/model"] }),
  );
  fetchImageModels.mockResolvedValue({
    models: [
      { id: "agnes/enabled", displayName: "Agnes 测试模型", description: "" },
    ],
  });
  render(
    <ImageModelPreferencePopover open onOpenChange={() => {}}>
      <Button>生成模型偏好</Button>
    </ImageModelPreferencePopover>,
  );
  await userEvent.click(
    await screen.findByRole("checkbox", { name: "Agnes 测试模型" }),
  );
  expect(
    JSON.parse(localStorage.getItem("loomic:image-model-preference") ?? "null"),
  ).toEqual({ mode: "manual", models: ["agnes/enabled"] });
});
it("explains when the administrator has not enabled any models", async () => {
  fetchImageModels.mockResolvedValue({ models: [] });
  render(
    <ImageModelPreferencePopover open onOpenChange={() => {}}>
      <Button>生成模型偏好</Button>
    </ImageModelPreferencePopover>,
  );
  expect(
    await screen.findByText("暂无可用模型，请管理员先启用。"),
  ).toBeInTheDocument();
});

it("separates automatic selection from multi-select and remembers the manual selection", async () => {
  const user = userEvent.setup();
  saveImagePreference("auto", ["configured/agnes-image-2.5"]);
  renderSelector();
  await screen.findByText("Agnes Image 2.5 Flash");
  expect(
    screen.getByRole("combobox", { name: "图片模型选择方式" }),
  ).toHaveTextContent("自动选择");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(screen.getByText("共 3 个可用")).toBeInTheDocument();

  await user.click(screen.getByRole("combobox", { name: "图片模型选择方式" }));
  await user.keyboard("{ArrowDown}{Enter}");
  expect(
    screen.getByRole("checkbox", { name: "Agnes Image 2.5 Flash" }),
  ).toBeChecked();
  await user.click(screen.getByRole("checkbox", { name: "Nano Banana" }));
  expect(screen.getByText("已选 2 个图片模型")).toBeInTheDocument();
  await chooseMode(user, "auto");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  await chooseMode(user, "manual");
  expect(screen.getByText("已选 2 个图片模型")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Nano Banana" })).toBeChecked();
  expect(
    screen.getByText("用于图片和视频生成，对话模型在输入框左侧选择。"),
  ).toBeInTheDocument();
});

it("groups by saved provider identity, including separate accounts for the same vendor", async () => {
  saveImagePreference("manual", ["configured/agnes-image-2.5"]);
  fetchImageModels.mockResolvedValue({
    models: [
      ...imageModels,
      {
        ...imageModels[1],
        id: "configured/backup",
        providerId: "agnes-backup",
        providerName: "备用 Agnes",
        displayName: "备用图片模型",
      },
    ],
  });
  renderSelector();
  const team = await screen.findByRole("group", { name: /团队 Agnes/ });
  expect(within(team).getAllByRole("checkbox")).toHaveLength(2);
  expect(
    within(screen.getByRole("group", { name: /备用 Agnes/ })).getByRole(
      "checkbox",
      { name: "备用图片模型" },
    ),
  ).toBeInTheDocument();
});

it("searches providers and model capabilities without changing hidden selections or their count", async () => {
  const user = userEvent.setup();
  saveImagePreference("manual", [
    "configured/google-image",
    "configured/agnes-image-2.5",
  ]);
  renderSelector();
  await screen.findByRole("checkbox", { name: "Nano Banana" });
  const search = screen.getByRole("searchbox", {
    name: "搜索图片模型或提供商",
  });
  await user.type(search, "团队 4k");
  expect(
    screen.getByRole("checkbox", { name: "Agnes Image 2.5 Flash" }),
  ).toBeChecked();
  expect(
    screen.queryByRole("checkbox", { name: "Nano Banana" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("checkbox", { name: "Agnes Image 2.1 Flash" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("已选 2 个图片模型")).toBeInTheDocument();
  await user.clear(search);
  await user.type(search, "不存在的模型");
  expect(
    screen.getByText("没有匹配的模型或提供商，试试其他关键词。"),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("暂无可用模型，请管理员先启用。"),
  ).not.toBeInTheDocument();
  expect(screen.getByText("已选 2 个图片模型")).toBeInTheDocument();
  expect(
    JSON.parse(localStorage.getItem("loomic:image-model-preference") ?? "null")
      .models,
  ).toEqual(["configured/google-image", "configured/agnes-image-2.5"]);
});

it.each([
  {
    kind: "图片",
    storageKey: "loomic:image-model-preference",
    id: "configured/agnes-image-2.5",
    name: "Agnes Image 2.5 Flash",
  },
  {
    kind: "视频",
    storageKey: "loomic:video-model-preference",
    id: "configured/veo",
    name: "Veo 3.1",
  },
])(
  "returns $kind selection to automatic when the last model is deselected and keeps focus",
  async ({ kind, storageKey, id, name }) => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ mode: "manual", models: [id] }),
    );
    renderSelector();
    await userEvent.click(screen.getByRole("tab", { name: kind }));
    const selected = await screen.findByRole("checkbox", { name });
    await userEvent.click(selected);
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByText(`自动选择${kind}模型`)).toBeInTheDocument();
    const mode = screen.getByRole("combobox", { name: `${kind}模型选择方式` });
    expect(mode).toHaveTextContent("自动选择");
    expect(mode).toHaveFocus();
    expect(
      JSON.parse(localStorage.getItem(storageKey) ?? "null"),
    ).toMatchObject({ mode: "auto" });
  },
);

it("can clear a multi-model restriction with the explicit automatic selection action", async () => {
  saveImagePreference("manual", [
    "configured/google-image",
    "configured/agnes-image-2.5",
  ]);
  renderSelector();
  await screen.findByText("已选 2 个图片模型");
  await userEvent.click(screen.getByRole("button", { name: "恢复自动" }));
  expect(screen.getByText("自动选择图片模型")).toBeInTheDocument();
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(
    screen.getByRole("combobox", { name: "图片模型选择方式" }),
  ).toHaveFocus();
});

it("keeps image and video selections and searches independent", async () => {
  const user = userEvent.setup();
  saveImagePreference("manual", ["configured/agnes-image-2.5"]);
  renderSelector();
  await screen.findByRole("checkbox", { name: "Agnes Image 2.5 Flash" });
  await user.type(screen.getByRole("searchbox"), "Agnes");
  await user.click(screen.getByRole("tab", { name: "视频" }));
  expect(
    screen.getByRole("searchbox", { name: "搜索视频模型或提供商" }),
  ).toHaveValue("");
  expect(
    screen.getByRole("combobox", { name: "视频模型选择方式" }),
  ).toHaveTextContent("自动选择");
  await screen.findByText("Veo 3.1");
  await chooseMode(user, "manual");
  await user.click(screen.getByRole("checkbox", { name: "Veo 3.1" }));
  expect(screen.getByText("已选 1 个视频模型")).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "图片" }));
  expect(
    screen.getByRole("searchbox", { name: "搜索图片模型或提供商" }),
  ).toHaveValue("Agnes");
  expect(
    screen.getByRole("checkbox", { name: "Agnes Image 2.5 Flash" }),
  ).toBeChecked();
  expect(screen.getByText("已选 1 个图片模型")).toBeInTheDocument();
  expect(
    JSON.parse(localStorage.getItem("loomic:video-model-preference") ?? "null"),
  ).toEqual({ mode: "manual", models: ["configured/veo"] });
});

it("does not report empty or disabled models before the catalog has loaded", async () => {
  saveImagePreference("manual", ["configured/agnes-image-2.5"]);
  let respond = () => {};
  fetchImageModels.mockReturnValue(
    new Promise<{ models: ImageModelInfo[] }>((resolve) => {
      respond = () => resolve({ models: imageModels });
    }),
  );
  renderSelector();
  expect(screen.getByText("正在加载图片模型…")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.queryByText("暂无可用模型，请管理员先启用。"),
  ).not.toBeInTheDocument();
  await act(async () => respond());
  expect(
    await screen.findByRole("checkbox", { name: "Agnes Image 2.5 Flash" }),
  ).toBeChecked();
});

it("shows a load failure and retries only the failed catalog", async () => {
  const user = userEvent.setup();
  fetchImageModels.mockRejectedValueOnce(new Error("Network error"));
  renderSelector();
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "图片模型加载失败，请重试。",
  );
  expect(
    screen.queryByText("暂无可用模型，请管理员先启用。"),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "重新加载" }));
  await screen.findByText("Nano Banana");
  expect(fetchImageModels).toHaveBeenCalledTimes(2);
  expect(fetchVideoModels).toHaveBeenCalledOnce();
});
