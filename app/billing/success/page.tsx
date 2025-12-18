import { stripe } from "@/lib/stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function BillingSuccessPage({
  searchParams,
}: {
  searchParams: { session_id?: string };
}) {
  const sessionId = searchParams.session_id;
  if (!sessionId) redirect("/dashboard");

  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ["line_items"],
  });

  const userId = session.client_reference_id;
  if (!userId) redirect("/dashboard");

  const priceId = session.line_items?.data?.[0]?.price?.id;
  const tier =
    priceId === process.env.STRIPE_PRICE_LESSONS_AI_TUTOR ? "lessons_ai" : "lessons";

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  await client.users.updateUser(userId, {
    unsafeMetadata: { ...(user.unsafeMetadata || {}), tier },
  });

  redirect("/dashboard");
}
