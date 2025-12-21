import { auth, clerkClient } from "@clerk/nextjs/server";

/**
 * Saves basic profile fields to Clerk (unsafeMetadata).
 *
 * Note: Subscription selection + payment is handled on /dashboard.
 * This endpoint should NOT set or change the subscription tier.
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = (await req.json()) as Partial<{
    firstName: string;
    lastName: string;
    gradeLevel: string;
    schoolName: string;
    city: string;
    province: string;
    country: string;
  }>;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);

  const existing = (user.unsafeMetadata || {}) as Record<string, any>;

  const nextUnsafe: Record<string, any> = {
    ...existing,
    gradeLevel: body.gradeLevel ?? (existing.gradeLevel as string) ?? "",
    schoolName: body.schoolName ?? (existing.schoolName as string) ?? "",
    city: body.city ?? (existing.city as string) ?? "",
    province: body.province ?? (existing.province as string) ?? "",
    country: body.country ?? (existing.country as string) ?? "",
  };

  await client.users.updateUser(userId, {
    firstName: body.firstName ?? user.firstName ?? undefined,
    lastName: body.lastName ?? user.lastName ?? undefined,
    unsafeMetadata: nextUnsafe,
  });

  return Response.json({ ok: true });
}
