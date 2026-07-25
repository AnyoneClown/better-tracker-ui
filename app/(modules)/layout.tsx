import type { ReactNode } from "react";

import { ModuleShell } from "@/components/module-shell";
import { requireAuthenticatedUser } from "@/lib/server-auth";

export default async function ModulesLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticatedUser("/");
  return <ModuleShell user={user}>{children}</ModuleShell>;
}
