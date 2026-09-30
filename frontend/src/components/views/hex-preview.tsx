"use client";

import * as React from "react";

import { decodeBase64, toAsciiGlyph } from "@/lib/format";
import { cn } from "@/lib/utils";

export function hexDumpLines(bytes: Uint8Array, baseOffset: number, bytesPerRow = 16) {
  const rows: { offset: number; hex: string[]; ascii: string }[] = [];
  for (let index = 0; index < bytes.length; index += bytesPerRow) {
    const slice = bytes.subarray(index, index + bytesPerRow);
    const hex: string[] = [];
    let ascii = "";
    for (let position = 0; position < bytesPerRow; position += 1) {
      if (position < slice.length) {
        hex.push(slice[position].toString(16).padStart(2, "0").toUpperCase());
        ascii += toAsciiGlyph(slice[position]);
      } else {
        hex.push("  ");
        ascii += " ";
      }
    }
    rows.push({ offset: baseOffset + index, hex, ascii });
  }
  return rows;
}

export function HexPreview({
  base64,
  baseOffset = 0,
  maxRows = 32,
  className,
}: {
  base64: string;
  baseOffset?: number;
  maxRows?: number;
  className?: string;
}) {
  const rows = React.useMemo(
    () => hexDumpLines(decodeBase64(base64), baseOffset).slice(0, maxRows),
    [base64, baseOffset, maxRows],
  );
  return (
    <div
      className={cn(
        "scroll-thin overflow-auto rounded-md border border-line bg-surface-muted",
        className,
      )}
    >
      <table className="w-full font-mono text-[11px] leading-5">
        <tbody>
          {rows.map((row) => (
            <tr key={row.offset}>
              <td className="whitespace-nowrap border-r border-line px-2 text-ink-soft">
                {row.offset.toString(16).padStart(8, "0").toUpperCase()}
              </td>
              <td className="whitespace-nowrap px-2 text-ink">
                {row.hex.map((value, index) => (
                  <span key={index} className={cn("pr-1", index === 7 && "pr-3")}>
                    {value}
                  </span>
                ))}
              </td>
              <td className="whitespace-pre border-l border-line px-2 text-ink-muted">
                {row.ascii}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
