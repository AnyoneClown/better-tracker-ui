import type { ReactNode } from "react";

import { ModuleShell } from "@/components/module-shell";

export default function ModulesLayout({ children }: { children: ReactNode }) {
  return <ModuleShell>{children}</ModuleShell>;
}
