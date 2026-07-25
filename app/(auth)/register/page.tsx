import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { safeReturnPath } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Create an account — Better Tracker",
  description: "Create your private Better Tracker workspace.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nextPath = safeReturnPath(params.next);
  const user = await getAuthenticatedUser();
  if (user) redirect(nextPath);

  return <AuthForm mode="register" nextPath={nextPath} />;
}
