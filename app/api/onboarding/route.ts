import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Saves basic profile fields to Clerk.
 *
 * For now, Get Started is just signup + email verification.
 * Payment/plan selection will be handled later in the dashboard.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json()) as {
    firstName?: string;
    lastName?: string;
    gradeLevel?: string;
    schoolName?: string;
    city?: string;
    province?: string;
    country?: string;
  };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const existing = (user.unsafeMetadata ?? {}) as Record<string, unknown>;

  const nextUnsafe: Record<string, unknown> = {
    ...existing,
    // ensure a default tier exists (free until the dashboard upgrades it)
    tier: (existing.tier as string) ?? "free",
    gradeLevel: body.gradeLevel ?? (existing.gradeLevel as string) ?? "",
    schoolName: body.schoolName ?? (existing.schoolName as string) ?? "",
    city: body.city ?? (existing.city as string) ?? "",
    province: body.province ?? (existing.province as string) ?? "",
    country: body.country ?? (existing.country as string) ?? "",
  };

  // clear any old "requestedTier" left over from previous experiments
  delete nextUnsafe.requestedTier;

  await client.users.updateUser(userId, {
    firstName: body.firstName ?? user.firstName ?? undefined,
    lastName: body.lastName ?? user.lastName ?? undefined,
    unsafeMetadata: nextUnsafe,
  });

  return Response.json({ ok: true });
}
