import { describe, expect, it } from "vitest";
import {
  chapterGroups,
  flattenChapters,
  formatDate,
  friendlyError,
  parseOption,
  sortChapters,
} from "./utils";

describe("chapter helpers", () => {
  it("flattens flat and grouped chapters", () => {
    const flat = flattenChapters({ "1": "Chapter 1", "2": "Chapter 2" });
    expect(flat.map((chapter) => chapter.title)).toEqual([
      "Chapter 1",
      "Chapter 2",
    ]);
    const grouped = flattenChapters({
      "Group A": { a1: "A1", a2: "A2" },
      "Group B": { b1: "B1" },
    });
    expect(grouped).toHaveLength(3);
    expect(grouped[0].group).toBe("Group A");
  });

  it("groups flat chapters into a single group", () => {
    const groups = chapterGroups({ "1": "One", "2": "Two" });
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("");
    expect(groups[0].chapters).toHaveLength(2);
  });

  it("sorts chapters by title and reverses", () => {
    const chapters = [
      { id: "1", title: "Chapter 10", index: 0 },
      { id: "2", title: "Chapter 2", index: 1 },
      { id: "3", title: "Chapter 1", index: 2 },
    ];
    expect(sortChapters(chapters, "titleAscending").map((c) => c.id)).toEqual([
      "3",
      "2",
      "1",
    ]);
    expect(sortChapters(chapters, "reverse").map((c) => c.id)).toEqual([
      "3",
      "2",
      "1",
    ]);
  });

  it("parses option strings", () => {
    expect(parseOption("value-Display Text")).toEqual({
      value: "value",
      text: "Display Text",
    });
    expect(parseOption("plain")).toEqual({ value: "plain", text: "plain" });
  });
});

describe("display helpers", () => {
  it("formats dates with the Chinese locale", () => {
    const text = formatDate("2026-10-21T06:20:00Z");
    expect(text).toContain("2026");
    expect(text).toContain("年");
    expect(text).not.toMatch(/AM|PM/);
  });

  it("turns source errors into short Chinese messages", () => {
    expect(
      friendlyError(new Error("SOURCE_ERROR(502): Invalid status code: 210")),
    ).toContain("HTTP 210");
    expect(friendlyError(new Error("at load (eval_script:215:30)"))).toBe(
      "漫画源暂时不可用，请稍后重试",
    );
    expect(friendlyError(new Error("429 RATE_LIMITED"))).toBe(
      "请求过于频繁，请稍后重试",
    );
    expect(
      friendlyError(
        new Error("https://x.test: Connection Failed: Connection refused"),
      ),
    ).toBe("源站连接失败，请稍后重试");
    expect(friendlyError(new Error("Login expired"))).toBe(
      "登录状态已过期，请重新登录",
    );
    expect(friendlyError(new Error("章节不存在"))).toBe("章节不存在");
  });
});
