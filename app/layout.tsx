import type { Metadata } from "next";
import "./globals.css";
import { ClerkProvider } from "@clerk/nextjs";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Brilliem Education",
  description:
    "Alberta-aligned learning with clear video lessons, smart practice, and instant help.",
};

function BrandFooter() {
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="min-h-screen bg-white text-slate-900 antialiased">
          <SiteHeader />
          {children}

          <footer className="border-t border-slate-200 bg-white">
            <div className="mx-auto max-w-6xl px-4 py-10">
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="max-w-md">
                  <BrandFooter />
                  <p className="mt-3 text-sm text-slate-600">
                    Alberta-aligned learning with clear videos, smart practice,
                    and instant help.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-10 text-sm md:grid-cols-3">
                  <div>
                    <div className="font-semibold text-slate-900">Product</div>
                    <ul className="mt-3 space-y-2 text-slate-600">
                      <li>
                        <a className="hover:text-slate-900" href="/#features">
                          What you get
                        </a>
                      </li>
                      <li>
                        <a
                          className="hover:text-slate-900"
                          href="/#how-it-works"
                        >
                          How it works
                        </a>
                      </li>
                      <li>
                        <a className="hover:text-slate-900" href="/#faq">
                          FAQ
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-semibold text-slate-900">Company</div>
                    <ul className="mt-3 space-y-2 text-slate-600">
                      <li>
                        <a className="hover:text-slate-900" href="#">
                          About
                        </a>
                      </li>
                      <li>
                        <a className="hover:text-slate-900" href="#">
                          Contact
                        </a>
                      </li>
                    </ul>
                  </div>

                  <div>
                    <div className="font-semibold text-slate-900">Legal</div>
                    <ul className="mt-3 space-y-2 text-slate-600">
                      <li>
                        <a className="hover:text-slate-900" href="#">
                          Privacy
                        </a>
                      </li>
                      <li>
                        <a className="hover:text-slate-900" href="#">
                          Terms
                        </a>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="mt-10 flex flex-col gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
                <span>© {new Date().getFullYear()} Brilliem Education.</span>
                <span>Made in Canada.</span>
              </div>
            </div>
          </footer>
        </body>
      </html>
    </ClerkProvider>
  );
}
