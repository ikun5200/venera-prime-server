import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import DownloadsPage from "./DownloadsPage";
import { useAppStore } from "../lib/store";
import { mockFetch } from "../test/test-utils";

function renderDownloads() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/downloads"]}>
        <Routes>
          <Route path="/downloads" element={<DownloadsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const job = {
  id: "job_a",
  kind: "images",
  sourceKey: "test",
  comicId: "comic",
  comicType: 1,
  title: "Queue A",
  cover: "",
  state: "paused",
  progress: 0.5,
  total: 2,
  error: null,
  createdAt: 1,
  updatedAt: 2,
  payload: {},
  chapters: [
    {
      id: "1",
      name: "Chapter 1",
      status: "error",
      totalPages: 10,
      downloadedPages: 2,
    },
    {
      id: "2",
      name: "Chapter 2",
      status: "pending",
      totalPages: 0,
      downloadedPages: 0,
    },
  ],
};

describe("DownloadsPage", () => {
  afterEach(cleanup);

  beforeEach(() => {
    useAppStore.setState({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        createdAt: 0,
        disabled: false,
      },
      settings: { language: "zh-CN" },
    });
  });

  it("shows localized queue controls and retries a failed chapter", async () => {
    const fetchMock = mockFetch({
      "/api/downloads": { items: [job] },
      "/api/downloads/job_a/chapters/1/retry": { job },
      "/api/downloads/job_a/down": { job },
    });
    renderDownloads();
    expect(await screen.findByText("Queue A")).toBeTruthy();
    expect(screen.getByText("已暂停")).toBeTruthy();
    expect(screen.getByLabelText("下移")).toBeTruthy();
    expect(screen.getByLabelText("移到最前")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "章节 · 2" }));
    const retry = await screen.findByLabelText("重试本章");
    fireEvent.click(retry);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/api/downloads/job_a/chapters/1/retry"),
        ),
      ).toBe(true),
    );
  });
});
