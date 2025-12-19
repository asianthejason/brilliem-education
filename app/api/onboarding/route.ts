import { auth, clerkClient } from "@clerk/nextjs/server";

type Tier = "free" | "lessons" | "lessons_ai";

/**
 * Saves onboarding/profile fields to Clerk.
 *
 * IMPORTANT: For paid tiers, we store the user's selection as `requestedTier`
 * and keep `tier` as-is (defaulting to "free") until Stripe confirms payment.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json()) as {
    firstName?: string;
    lastName?: string;
    tier?: Tier;
    gradeLevel?: string;
    schoolName?: string;
    city?: string;
    province?: string;
    country?: string;
  };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existing = (user.unsafeMetadata ?? {}) as Record<string, unknown>;

  const desiredTier: Tier = (body.tier ?? (existing.tier as Tier) ?? "free") as Tier;

  const nextUnsafe: Record<string, unknown> = {
    ...existing,
    gradeLevel: body.gradeLevel ?? (existing.gradeLevel as string) ?? "",
    schoolName: body.schoolName ?? (existing.schoolName as string) ?? "",
    city: body.city ?? (existing.city as string) ?? "",
    province: body.province ?? (existing.province as string) ?? "",
    country: body.country ?? (existing.country as string) ?? "",
  };

  // Tier logic:
  // - free: tier="free", requestedTier cleared
  // - paid: requestedTier set, tier stays whatever it already was (default "free")
  if (desiredTier === "free") {
    nextUnsafe.tier = "free";
    delete nextUnsafe.requestedTier;
  } else {
    nextUnsafe.requestedTier = desiredTier;
    nextUnsafe.tier = (existing.tier as Tier) ?? "free";
  }

  await client.users.updateUser(userId, {
    firstName: body.firstName ?? user.firstName ?? undefined,
    lastName: body.lastName ?? user.lastName ?? undefined,
    unsafeMetadata: nextUnsafe,
  });

  return Response.json({ ok: true });
}
