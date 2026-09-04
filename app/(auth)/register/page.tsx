import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { googleAuthErrorMessage, safeReturnPath } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Створити обліковий запис — Better Tracker",
  description: "Створіть особистий простір Better Tracker.",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const nextPath = safeReturnPath(params.next);
  const user = await getAuthenticatedUser();
  if (user) redirect(nextPath);

  return (
    <AuthForm
      mode="register"
      nextPath={nextPath}
      oauthError={googleAuthErrorMessage(params.oauth_error)}
    />
  );
}
