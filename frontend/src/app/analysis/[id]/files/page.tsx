import { Suspense } from "react";

import { SkeletonSurface } from "@/components/common/states";
import { FileExplorerView } from "@/components/views/file-explorer";

export default function FilesPage() {
  return (
    <Suspense fallback={<SkeletonSurface rows={10} />}>
      <FileExplorerView />
    </Suspense>
  );
}
