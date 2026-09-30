import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-canvas px-6">
      <div className="surface w-full max-w-md p-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-soft">
          Error 404
        </p>
        <h1 className="mt-1 text-lg font-semibold text-ink">This page does not exist</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          The workspace route you followed is not part of FATScope.
        </p>
        <Button asChild variant="primary" size="sm" className="mt-4">
          <Link href="/">Return to the case workbench</Link>
        </Button>
      </div>
    </div>
  );
}
