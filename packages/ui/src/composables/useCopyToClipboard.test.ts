import { describe, it, expect, mock, beforeEach } from "bun:test";

const success = mock(() => {});
const error = mock(() => {});
mock.module("vue-toastification", () => ({
  useToast: () => ({ success, error }),
}));

const writeText = mock(async () => {});

const { useCopyToClipboard } = await import("./useCopyToClipboard");

describe("useCopyToClipboard", () => {
  beforeEach(() => {
    success.mockClear();
    error.mockClear();
    writeText.mockClear();
    // @ts-expect-error minimal clipboard stub for the test environment
    globalThis.navigator = { clipboard: { writeText } };
  });

  it("writes the text and toasts the success message", async () => {
    const { copy } = useCopyToClipboard();
    const ok = await copy("address", "Address copied");

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("address");
    expect(success).toHaveBeenCalledWith("Address copied");
  });

  it("writes without a success toast when no message is given", async () => {
    const { copy } = useCopyToClipboard();
    const ok = await copy("address");

    expect(ok).toBe(true);
    expect(writeText).toHaveBeenCalledWith("address");
    expect(success).not.toHaveBeenCalled();
  });

  it("returns false for empty text without touching the clipboard", async () => {
    const { copy } = useCopyToClipboard();
    const ok = await copy("");

    expect(ok).toBe(false);
    expect(writeText).not.toHaveBeenCalled();
  });

  it("toasts an error and returns false when the write fails", async () => {
    writeText.mockImplementationOnce(async () => {
      throw new Error("denied");
    });
    const { copy } = useCopyToClipboard();
    const ok = await copy("address");

    expect(ok).toBe(false);
    expect(error).toHaveBeenCalled();
  });
});
