import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { AiTutorClient } from "./AiTutorClient";

type Tier = "none" | "free" | "lessons" | "lessons_ai";

export default async function AITutorPage() {
  const { userId } = await auth();
  if (!userId) redirect("/");

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const tier = ((user.unsafeMetadata?.tier as Tier) || "none") as Tier;

  if (tier === "none") redirect("/dashboard");

  // Only top tier can access AI Tutor
  if (tier !== "lessons_ai") redirect("/dashboard");

  return (
    <AiTutorClient />
  );
}
