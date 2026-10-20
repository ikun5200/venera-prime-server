import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import LoginPage from "./LoginPage";
import { useAppStore } from "../lib/store";
import { mockFetch } from "../test/test-utils";

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>HOME</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    useAppStore.setState({ user: null, settings: {}, initialized: true });
  });

  it("logs in and navigates home", async () => {
    mockFetch({
      "/api/auth/login": {
        user: {
          id: 1,
          username: "admin",
          role: "admin",
          createdAt: 0,
          disabled: false,
        },
      },
      "/api/settings": { theme_mode: "dark" },
    });
    renderLogin();
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "secret1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(screen.getByText("HOME")).toBeInTheDocument());
    expect(useAppStore.getState().user?.username).toBe("admin");
    expect(useAppStore.getState().settings.theme_mode).toBe("dark");
  });

  it("shows the server error on invalid credentials", async () => {
    mockFetch({
      "/api/auth/login": () =>
        new Response(
          JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Invalid username or password",
              requestId: "r1",
            },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    });
    renderLogin();
    fireEvent.change(screen.getByLabelText("用户名"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("密码"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() =>
      expect(
        screen.getByText("Invalid username or password"),
      ).toBeInTheDocument(),
    );
    expect(useAppStore.getState().user).toBeNull();
    vi.restoreAllMocks();
  });
});
