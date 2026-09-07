import React from "react";

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Modal } from "@/components/ui/modal";

describe("Modal", () => {
  it("does not render when closed", () => {
    render(
      <Modal open={false} onClose={vi.fn()} title="Settings">
        body
      </Modal>,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders content in portal and closes on escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal open onClose={onClose} title="Settings" description="Panel">
        body
      </Modal>,
    );

    expect(await screen.findByRole("dialog", { name: "Settings" })).toHaveAccessibleDescription("Panel");
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Panel")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes by backdrop click and close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(
      <Modal open onClose={onClose} title="Settings">
        body
      </Modal>,
    );

    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close modal backdrop" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Close modal" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("does not close when content is clicked and supports keyboard dismissal", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Settings">
        <button type="button">Save settings</button>
      </Modal>,
    );

    await user.click(await screen.findByRole("button", { name: "Save settings" }));
    expect(onClose).not.toHaveBeenCalled();
    screen.getByRole("button", { name: "Close modal backdrop" }).focus();
    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks body scroll while open and restores it on unmount", async () => {
    const { unmount } = render(
      <Modal open onClose={vi.fn()} title="Settings">
        body
      </Modal>,
    );

    await screen.findByRole("dialog");
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).toBe("");
  });
});
