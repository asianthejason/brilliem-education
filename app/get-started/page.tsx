import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { GetStartedClient } from "./ui";

export default function GetStartedPage() {
  const { userId } = auth();

  // If they aren’t signed in yet, Clerk will handle signup in the embedded component
  // but your onboarding + tiers should require being signed in.
  if (!userId) {
    return <GetStartedClient mode="signup" />;
  }

  return <GetStartedClient mode="onboarding" />;
}
