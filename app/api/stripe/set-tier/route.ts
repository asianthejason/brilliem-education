import { auth, clerkClient } from "@clerk/nextjs/server";

type Tier = "free";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json().catch(() => null)) as { tier?: Tier } | null;
  if (body?.tier !== "free") return new Response("Invalid tier", { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const meta = (user.unsafeMetadata || {}) as Record<string, any>;

  const nextUnsafe: Record<string, any> = {
    ...meta,
    tier: "free",
    // Keep stripeCustomerId if it exists (helps future upgrades),
    // but clear any old subscription tracking.
    stripeSubscriptionId: undefined,
    stripeSubscriptionStatus: "free",
  };

  // Remove undefined keys to keep metadata clean.
  Object.keys(nextUnsafe).forEach((k) => nextUnsafe[k] === undefined && delete nextUnsafe[k]);

  await client.users.updateUser(userId, { unsafeMetadata: nextUnsafe });

  return Response.json({ ok: true });
}
