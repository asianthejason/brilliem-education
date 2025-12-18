import { auth } from "@clerk/nextjs/server";
import { GetStartedClient } from "./ui";

export default async function GetStartedPage() {
  const { userId } = await auth();

  // If they aren’t signed in yet, show the embedded signup.
  if (!userId) {
    return <GetStartedClient mode="signup" />;
  }

  // If signed in, show onboarding + tier selection.
  return <GetStartedClient mode="onboarding" />;
}
