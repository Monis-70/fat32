import { Suspense } from "react";

import { SkeletonSurface } from "@/components/common/states";
import { FindingsView } from "@/components/views/findings";

export default function FindingsPage() {
  return (
    <Suspense fallback={<SkeletonSurface rows={8} />}>
      <FindingsView />
    </Suspense>
  );
}
