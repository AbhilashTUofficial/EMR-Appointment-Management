import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Modal } from "./Modal";

afterEach(cleanup);

const tab = (shiftKey = false) => fireEvent.keyDown(document, { key: "Tab", shiftKey });

function Harness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      {open && (
        <Modal
          title="Edit appointment"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
        >
          <input aria-label="Purpose" />
          <button>Save</button>
        </Modal>
      )}
    </>
  );
}

describe("Modal", () => {
  it("is a labelled dialog and moves focus into it", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));
    expect(screen.getByRole("dialog", { name: "Edit appointment" })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText("Purpose"));
  });

  it("keeps Tab inside the dialog", () => {
    render(<Harness />);
    fireEvent.click(screen.getByText("Open"));

    screen.getByText("Save").focus();
    tab();
    expect(document.activeElement).toBe(screen.getByLabelText("Purpose"));
    tab(true);
    expect(document.activeElement).toBe(screen.getByText("Save"));
  });

  it("closes with Escape and gives focus back to what opened it", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByText("Open");
    opener.focus();
    fireEvent.click(opener);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("does not close, and so does not lose typing, when the backdrop is clicked", () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    fireEvent.click(screen.getByText("Open"));
    fireEvent.change(screen.getByLabelText("Purpose"), { target: { value: "Fever" } });

    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByLabelText("Purpose") as HTMLInputElement).value).toBe("Fever");
  });
});
