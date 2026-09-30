import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorState } from "@/components/common/states";
import { HexPreview, hexDumpLines } from "@/components/views/hex-preview";
import { ApiError } from "@/lib/api/client";
import { decodeBase64 } from "@/lib/format";

describe("hexDumpLines", () => {
  it("splits bytes into offset rows of sixteen", () => {
    const bytes = new Uint8Array(20).map((_, index) => index + 0x40);
    const rows = hexDumpLines(bytes, 0x1000);
    expect(rows).toHaveLength(2);
    expect(rows[0].offset).toBe(0x1000);
    expect(rows[1].offset).toBe(0x1010);
    expect(rows[0].hex[0]).toBe("40");
    expect(rows[0].ascii).toBe("@ABCDEFGHIJKLMNO");
  });

  it("pads the final row so columns stay aligned", () => {
    const rows = hexDumpLines(new Uint8Array([0x46, 0x41, 0x54]), 0);
    expect(rows[0].hex).toHaveLength(16);
    expect(rows[0].hex[3]).toBe("  ");
    expect(rows[0].ascii).toHaveLength(16);
    expect(rows[0].ascii.trimEnd()).toBe("FAT");
  });

  it("renders non printable bytes as placeholders", () => {
    const rows = hexDumpLines(new Uint8Array([0x00, 0xff, 0x1f]), 0);
    expect(rows[0].ascii.startsWith("...")).toBe(true);
  });
});

describe("HexPreview", () => {
  it("renders offsets, hexadecimal values and ascii", () => {
    const base64 = "RkFUMzIgICA=";
    render(<HexPreview base64={base64} baseOffset={0x200} />);
    expect(screen.getByText("00000200")).toBeInTheDocument();
    expect(screen.getByText("46")).toBeInTheDocument();
    expect(decodeBase64(base64)[0]).toBe(0x46);
  });
});

describe("ErrorState", () => {
  it("explains a backend outage", () => {
    render(
      <ErrorState
        error={
          new ApiError(
            "The FATScope analysis service is unreachable.",
            "offline",
            null,
            "backend_offline",
            "Start the backend service.",
          )
        }
      />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Analysis service unreachable")).toBeInTheDocument();
    expect(screen.getByText("Start the backend service.")).toBeInTheDocument();
  });

  it("explains an unsupported image", () => {
    render(
      <ErrorState
        error={
          new ApiError(
            "The MBR partition table contains no readable FAT32 partition.",
            "unsupported",
            415,
            "unsupported_extension",
            null,
          )
        }
      />,
    );
    expect(screen.getByText("Unsupported evidence image")).toBeInTheDocument();
  });

  it("falls back for unknown errors", () => {
    render(<ErrorState error={new Error("boom")} />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
