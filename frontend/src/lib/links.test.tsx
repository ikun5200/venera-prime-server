import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";

function ParamsProbe() {
  const { source, id } = useParams();
  return <div>{`${source}|${id}`}</div>;
}

describe("comic route params", () => {
  it("decodes ids containing slashes", () => {
    render(
      <MemoryRouter initialEntries={["/comic/goda/%2Fmanga%2Fa%2Fb"]}>
        <Routes>
          <Route path="/comic/:source/:id" element={<ParamsProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("goda|/manga/a/b")).toBeInTheDocument();
  });

  it("decodes full URL ids", () => {
    render(
      <MemoryRouter
        initialEntries={["/comic/ykmh/https%3A%2F%2Fexample.com%2Fm%2F1%2F"]}
      >
        <Routes>
          <Route path="/comic/:source/:id" element={<ParamsProbe />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("ykmh|https://example.com/m/1/")).toBeInTheDocument();
  });
});
