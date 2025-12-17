import { UserProfile } from "@clerk/nextjs";

export default function ProfilePage() {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Profile</h1>
      <p className="mt-2 text-slate-600">
        Manage your account details, password, and connected sign-in methods.
      </p>

      <div className="mt-6">
        <UserProfile routing="hash" />
      </div>
    </div>
  );
}
