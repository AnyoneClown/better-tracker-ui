import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthForm } from "@/components/auth-form";
import { googleAuthErrorMessage, safeReturnPath } from "@/lib/auth";
import { getAuthenticatedUser } from "@/lib/server-auth";

export const metadata: Metadata = {
  title: "Вхід — Better Tracker",
  description: "Увійдіть до свого особистого простору Better Tracker.",
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
      oauthError={googleAuthErrorMessage(params.oauth_error)}
    />
  );
}
