import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { LessonsClient } from "./LessonsClient";

type Tier = "none" | "free" | "lessons" | "lessons_ai";

export default async function LessonsPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const tier = ((user.unsafeMetadata?.tier as Tier) || "none") as Tier;

  if (tier === "none") redirect("/dashboard");

  return <LessonsClient tier={tier} />;
}
