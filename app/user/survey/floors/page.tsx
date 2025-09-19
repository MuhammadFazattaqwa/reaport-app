// app/user/survey/floors/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { Suspense } from "react";
import FloorsClient from "./FloorsClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <FloorsClient />
    </Suspense>
  );
}
