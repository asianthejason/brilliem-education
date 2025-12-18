import { auth, clerkClient } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const client = await clerkClient();

  await client.users.updateUser(userId, {
    firstName: body.firstName || undefined,
    lastName: body.lastName || undefined,
    unsafeMetadata: {
      ...(body.keepExisting ? undefined : {}),
      tier: body.tier, // "free" | "lessons" | "lessons_ai"
      gradeLevel: body.gradeLevel || "",
      schoolName: body.schoolName || "",
      city: body.city || "",
      province: body.province || "",
      country: body.country || "",
    },
  });

  return Response.json({ ok: true });
}
