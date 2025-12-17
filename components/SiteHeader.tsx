"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { AuthModal } from "@/components/AuthModal";

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 text-white shadow-sm">
        <span className="text-sm font-bold">B</span>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight">Brilliem</div>
        <div className="text-xs text-slate-500">Education</div>
      </div>
    </div>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const onHome = pathname === "/";
  const [open, setOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/" aria-label="Brilliem Education home">
            <Brand />
          </Link>

          {onHome && (
            <nav className="hidden items-center gap-6 text-sm text-slate-700 md:flex">
              <a className="hover:text-slate-900" href="#how-it-works">
                How it works
              </a>
              <a className="hover:text-slate-900" href="#features">
                What you get
              </a>
              <a className="hover:text-slate-900" href="#testimonials">
                Stories
              </a>
              <a className="hover:text-slate-900" href="#faq">
                FAQ
              </a>
            </nav>
          )}

          <div className="flex items-center gap-2">
            <SignedOut>
              <button
                onClick={() => setOpen(true)}
                className="hidden rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 md:inline-flex"
              >
                Sign in
              </button>
              <Link
                href="/get-started"
                className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Get started
              </Link>
            </SignedOut>

            <SignedIn>
              <Link
                href="/dashboard"
                className="inline-flex rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Dashboard
              </Link>
              <div className="ml-1">
                <UserButton />
              </div>
            </SignedIn>
          </div>
        </div>
      </header>

      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
