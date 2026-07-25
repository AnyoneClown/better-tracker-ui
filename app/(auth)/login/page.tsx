import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { safeReturnPath } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Sign in — Better Tracker",
  description: "Sign in to your private Better Tracker workspace.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nextPath = safeReturnPath(params.next);
  const user = await getAuthenticatedUser();
  if (user) redirect(nextPath);

  return (
    <AuthForm
      mode="login"
      nextPath={nextPath}
      sessionExpired={params.reason === "session-expired"}
    />
  );
}
