import { auth, clerkClient } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const { userId } = auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();

  await clerkClient.users.updateUser(userId, {
    firstName: body.firstName || undefined,
    lastName: body.lastName || undefined,
    unsafeMetadata: {
      tier: body.tier,
      city: body.city || "",
      province: body.province || "",
      country: body.country || "",
      gradeLevel: body.gradeLevel || "",
    },
  });

  return Response.json({ ok: true });
}
