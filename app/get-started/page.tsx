import { auth } from "@clerk/nextjs/server";
import { GetStartedClient } from "./ui";

export const dynamic = "force-dynamic";

export default async function GetStartedPage() {
  const { userId } = await auth();
  return <GetStartedClient mode={userId ? "onboarding" : "signup"} />;
}
