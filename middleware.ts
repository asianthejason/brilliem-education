import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/api/stripe(.*)",
  "/api/onboarding(.*)",
  "/billing(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  // In Clerk v6, `auth()` is async and returns an object that has `.protect()`
  if (isProtectedRoute(req)) (await auth()).protect();
});

export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
