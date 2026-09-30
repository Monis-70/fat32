import { Suspense } from "react";

import { SkeletonSurface } from "@/components/common/states";
import { ClusterMapView } from "@/components/views/cluster-map";

export default function ClustersPage() {
  return (
    <Suspense fallback={<SkeletonSurface rows={10} />}>
      <ClusterMapView />
    </Suspense>
  );
}
