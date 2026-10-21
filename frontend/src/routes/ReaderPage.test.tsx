import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ReaderPage from "./ReaderPage";
import { useAppStore } from "../lib/store";
import { mockFetch } from "../test/test-utils";

const details = {
  id: "comic-1",
  comicId: "comic-1",
  comicType: 123,
  sourceKey: "test_source",
  title: "Comic One",
  subtitle: "Author",
  subTitle: "Author",
  cover: "",
  description: "",
  tags: {},
  chapters: { "1": "Chapter 1", "2": "Chapter 2" },
  chapterCount: 2,
  recommend: [],
  favoriteFolders: [],
};

function renderReader() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/reader/test_source/comic-1"]}>
        <Routes>
          <Route path="/reader/:source/:id" element={<ReaderPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ReaderPage", () => {
  beforeEach(() => {
    useAppStore.setState({
      user: {
        id: 1,
        username: "admin",
        role: "admin",
        createdAt: 0,
        disabled: false,
      },
      settings: {
        readerMode: "galleryLeftToRight",
        showPageNumberInReader: true,
        preloadImageCount: 0,
        recordReadingStatistics: false,
        readerPageMarginEnabled: false,
      },
    });
    mockFetch({
      "/api/comic/test_source/comic-1": details,
      "/api/comic/test_source/comic-1/chapter/1/images": {
        images: ["a", "b", "c"],
        total: 3,
      },
      "/api/history": { ok: true },
      "/api/statistics": { ok: true },
    });
  });

  it("renders the chapter and turns pages with buttons and keyboard", async () => {
    renderReader();
    await waitFor(() =>
      expect(screen.getByText("Comic One")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByLabelText("下一张图片"));
    await waitFor(() =>
      expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0),
    );

    fireEvent.keyDown(document, { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getAllByText("3 / 3").length).toBeGreaterThan(0),
    );

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0),
    );
  });

  it("maps arrow keys to the reading direction", async () => {
    useAppStore.setState({
      settings: {
        ...useAppStore.getState().settings,
        readerMode: "galleryRightToLeft",
      },
    });
    const { unmount } = renderReader();
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    await waitFor(() =>
      expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0),
    );
    fireEvent.keyDown(document, { key: "ArrowRight" });
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );
    unmount();

    useAppStore.setState({
      settings: {
        ...useAppStore.getState().settings,
        readerMode: "galleryTopToBottom",
      },
    });
    const { unmount: unmountTtb } = renderReader();
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );
    fireEvent.keyDown(document, { key: "ArrowDown" });
    await waitFor(() =>
      expect(screen.getAllByText("2 / 3").length).toBeGreaterThan(0),
    );
    fireEvent.keyDown(document, { key: "ArrowUp" });
    await waitFor(() =>
      expect(screen.getAllByText("1 / 3").length).toBeGreaterThan(0),
    );
    unmountTtb();
  });

  it("opens the chapter drawer", async () => {
    renderReader();
    await waitFor(() =>
      expect(screen.getByText("Comic One")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getAllByLabelText("章节")[0]);
    await waitFor(() =>
      expect(screen.getAllByText("Chapter 1").length).toBeGreaterThan(0),
    );
    expect(screen.getAllByText("Chapter 2").length).toBeGreaterThan(0);
  });
});
