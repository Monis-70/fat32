import { Suspense } from "react";

import { SkeletonSurface } from "@/components/common/states";
import { HexViewerView } from "@/components/views/hex-viewer";

export default function HexPage() {
  return (
    <Suspense fallback={<SkeletonSurface rows={12} />}>
      <HexViewerView />
    </Suspense>
  );
}
