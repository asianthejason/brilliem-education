import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { GetStartedClient } from "./ui";

export const dynamic = "force-dynamic";

export default async function GetStartedPage() {
  const { userId } = await auth();
  if (userId) redirect("/dashboard");
  return <GetStartedClient />;
}
