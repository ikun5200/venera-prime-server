import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import ExplorePage from "./ExplorePage";
import { useAppStore } from "../lib/store";
import { mockFetch } from "../test/test-utils";

function ComicTarget() {
  const params = useParams();
  return (
    <div data-testid="comic-route">
      {params.source}/{params.id}
    </div>
  );
}

function renderExplore() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/explore"]}>
        <Routes>
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/comic/:source/:id" element={<ComicTarget />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ExplorePage", () => {
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
      settings: {
        language: "zh-CN",
        explore_pages: [],
        comicTileScale: 1,
      },
    });
    mockFetch({
      "/api/sources": {
        items: [
          {
            key: "test_source",
            name: "Test Source",
            version: "1.0.0",
            enabled: true,
            capabilities: { explore: true },
            account: { loggedIn: false },
          },
        ],
      },
      "/api/explore?source=test_source&page=1": {
        source: "test_source",
        page: 1,
        pages: [
          {
            index: 0,
            title: "Paged",
            type: "multiPageComicList",
            // Deliberately missing sourceKey: the page must fall back to the
            // active tab instead of building /comic/undefined/:id.
            data: {
              comics: [
                {
                  id: "p1",
                  title: "Comic P1",
                  cover: "https://example.com/cover.jpg",
                },
              ],
              maxPage: 1,
            },
            error: null,
          },
        ],
      },
    });
  });

  it("opens comics with the active source when payload lacks sourceKey", async () => {
    renderExplore();
    const card = await screen.findByText("Comic P1");
    fireEvent.click(card);
    await waitFor(() =>
      expect(screen.getByTestId("comic-route")).toHaveTextContent(
        "test_source/p1",
      ),
    );
  });
});
