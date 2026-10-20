import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Button, Modal, Switch, Tabs } from "./ui";

describe("UI primitives", () => {
  it("calls onClick and renders a loading button", () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(
      <Button onClick={onClick} loading>
        Save
      </Button>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("toggles a switch", () => {
    const onChange = vi.fn();
    render(<Switch checked={false} onChange={onChange} label="Auto" />);
    fireEvent.click(screen.getByRole("switch", { name: "Auto" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("closes a modal on Escape", () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Test">
        <p>Body</p>
      </Modal>,
    );
    expect(screen.getByText("Body")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("switches tabs", () => {
    const onChange = vi.fn();
    render(
      <Tabs
        items={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
        value="a"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});
