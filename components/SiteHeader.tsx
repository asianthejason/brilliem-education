"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { SignedIn, SignedOut } from "@clerk/nextjs";
import { AuthModal } from "@/components/AuthModal";

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-orange-500 via-pink-500 to-purple-600 text-white shadow-sm">
        <span className="text-sm font-bold">B</span>
      </div>
      <div className="leading-tight">
        <div className="text-sm font-semibold tracking-tight">StemX</div>
        <div className="text-xs text-slate-500">Academy</div>
      </div>
    </div>
  );
}

const navLinks = [
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#features", label: "What you get" },
  { href: "/#testimonials", label: "Stories" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Keep the top nav visible on all pages.
  // When not on the home page, these links will navigate back to "/" and jump to the section.
  const showTopNav = true;

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center gap-2">
            <Brand />
          </Link>

          {showTopNav && (
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="hover:text-slate-900"
                  prefetch={pathname === "/"}
                >
                  {l.label}
                </Link>
              ))}
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
            </SignedIn>
          </div>
        </div>
      </header>

      <AuthModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
