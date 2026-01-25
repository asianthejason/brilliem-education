import Link from "next/link";
import type { ReactNode } from "react";

type Testimonial = {
  name: string; // first + last initial
  location: string;
  quote: string;
  color: string; // tailwind classes
};

const testimonials: Testimonial[] = [
  {
    name: "Ava M.",
    location: "Calgary, AB",
    quote:
      "My son finally knows what to review. The progress view shows exactly which skills to practice next.",
    color: "from-emerald-500 to-green-500",
  },
  {
    name: "Noah K.",
    location: "Edmonton, AB",
    quote:
      "The AI tutor doesn’t just hand over answers — it explains step-by-step, so the learning actually sticks.",
    color: "from-sky-500 to-blue-600",
  },
  {
    name: "Mia R.",
    location: "Red Deer, AB",
    quote:
      "The videos are short and clear, and the practice never runs out. It feels like having a tutor on call.",
    color: "from-purple-500 to-fuchsia-600",
  },
  {
    name: "Ethan S.",
    location: "Lethbridge, AB",
    quote:
      "Unit tests and exam-style questions helped me feel ready before the real test at school.",
    color: "from-orange-500 to-pink-500",
  },
  {
    name: "Sophia T.",
    location: "Fort McMurray, AB",
    quote:
      "Great for catching up — and also great for going ahead. My daughter uses it to stay challenged.",
    color: "from-amber-500 to-orange-600",
  },
  {
    name: "Liam P.",
    location: "Airdrie, AB",
    quote:
      "Homework time is calmer. If we get stuck, we snap a photo, and the tutor guides us one step at a time.",
    color: "from-red-500 to-rose-600",
  },
];

function ColorDot({ className }: { className: string }) {
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full bg-gradient-to-r ${className}`}
      aria-hidden="true"
    />
  );
}

function Card({
  title,
  desc,
  accent,
  icon,
}: {
  title: string;
  desc: string;
  accent: string; // gradient classes
  icon: ReactNode;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md">
      <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br opacity-15 blur-2xl transition group-hover:opacity-25" />
      <div
        className={`absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${accent} opacity-15 blur-2xl`}
      />
      <div className="flex items-start gap-4">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br ${accent} text-white shadow-sm`}
        >
          {icon}
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{desc}</p>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
        <span className="inline-flex gap-1.5">
          <ColorDot className="from-emerald-500 to-green-500" />
          <ColorDot className="from-sky-500 to-blue-600" />
          <ColorDot className="from-purple-500 to-fuchsia-600" />
          <ColorDot className="from-orange-500 to-pink-500" />
          <ColorDot className="from-red-500 to-rose-600" />
        </span>
        <span>{eyebrow}</span>
      </div>
      <h2 className="mt-4 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-base text-slate-600">{subtitle}</p>
    </div>
  );
}

function PersonaCard({
  title,
  subtitle,
  bullets,
  accent,
  label,
}: {
  title: string;
  subtitle: string;
  bullets: string[];
  accent: string;
  label: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-7 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md">
      <div
        className={`absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-to-br ${accent} opacity-15 blur-3xl transition group-hover:opacity-25`}
        aria-hidden="true"
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-bold text-slate-900">{title}</div>
          <div className="mt-1 text-sm text-slate-600">{subtitle}</div>
        </div>
        <span
          className={`shrink-0 rounded-full bg-gradient-to-r ${accent} px-3 py-1 text-xs font-semibold text-white`}
        >
          {label}
        </span>
      </div>
      <ul className="mt-5 grid gap-2 text-sm text-slate-700">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2">
            <span
              className={`mt-1.5 inline-block h-2 w-2 rounded-full bg-gradient-to-r ${accent}`}
              aria-hidden="true"
            />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function HomePage() {
  return (
    <main className="bg-white">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-180px] h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-emerald-500 via-sky-500 to-purple-600 opacity-15 blur-3xl" />
          <div className="absolute left-[-120px] top-[240px] h-[320px] w-[320px] rounded-full bg-gradient-to-br from-orange-500 to-pink-500 opacity-12 blur-3xl" />
          <div className="absolute right-[-140px] top-[360px] h-[360px] w-[360px] rounded-full bg-gradient-to-br from-red-500 to-rose-600 opacity-10 blur-3xl" />
        </div>

        <div className="w-full border-b border-slate-200/60 bg-white/60 backdrop-blur">
          <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
            <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                <span className="inline-flex gap-1.5">
                  <ColorDot className="from-emerald-500 to-green-500" />
                  <ColorDot className="from-sky-500 to-blue-600" />
                  <ColorDot className="from-purple-500 to-fuchsia-600" />
                </span>
                Alberta Math curriculum • Skills → Units → Grades
              </div>

              <h1 className="mt-5 text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
                Ace Alberta Math
                <span className="mt-2 block text-xl font-semibold tracking-normal text-slate-700 md:text-2xl">
                  Clear lessons | Unlimited practices | Real progress
                </span>
              </h1>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                Brilliem gives Alberta-aligned lesson videos for every skill, unit,
                and grade — plus unlimited practice with explanations, progress tracking,
                unit tests, PAT/Diploma-style prep, and an AI tutor that teaches{" "}
                <span className="font-semibold text-slate-800">
                  one step at a time
                </span>{" "}
                (so students learn, not just copy answers).
              </p>

              <div id="get-started" className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="#who-its-for"
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  See who it helps
                </Link>
                <Link
                  href="#features"
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                >
                  Explore features
                </Link>
              </div>

              <div className="mt-7 flex flex-wrap items-center gap-4 text-sm text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <ColorDot className="from-emerald-500 to-green-500" />
                  Unlimited practice + explanations
                </span>
                <span className="inline-flex items-center gap-2">
                  <ColorDot className="from-sky-500 to-blue-600" />
                  Progress that shows “ready / not yet”
                </span>
                <span className="inline-flex items-center gap-2">
                  <ColorDot className="from-purple-500 to-fuchsia-600" />
                  AI tutor + photo questions
                </span>
              </div>
            </div>

            {/* Right hero card */}
            <div className="relative">
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      What a student does in 15 minutes
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      Learn → Practice → Fix mistakes → Move on confidently
                    </div>
                  </div>
                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    Grade 7 example
                  </div>
                </div>

                <div className="mt-6 grid gap-3">
                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        1) Watch a micro-lesson
                      </div>
                      <span className="text-xs font-semibold text-slate-500">
                        6–9 min
                      </span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-100">
                      <div className="h-2 w-2/3 rounded-full bg-gradient-to-r from-sky-500 to-blue-600" />
                    </div>
                    <div className="mt-3 text-xs text-slate-600">
                      Chapters: rule • examples • common mistakes
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        2) Practice (unlimited)
                      </div>
                      <span className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                        explanations included
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {[
                        "Try it: divisible by 2, 5, or 10?",
                        "Fix this mistake: 420 ÷ 5",
                        "Challenge: quick tests mixed",
                      ].map((q, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                        >
                          <span className="text-xs text-slate-700">{q}</span>
                          <span className="text-[11px] font-semibold text-slate-600">
                            Show steps →
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        3) Readiness check
                      </div>
                      <span className="rounded-full bg-gradient-to-r from-emerald-500 to-green-500 px-2 py-1 text-[11px] font-semibold text-white">
                        ready soon
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      Progress highlights what to review — then unlocks unit tests
                      when you’re ready.
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        Instant homework help
                      </div>
                      <span className="rounded-full bg-gradient-to-r from-purple-500 to-fuchsia-600 px-2 py-1 text-[11px] font-semibold text-white">
                        AI tutor
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-600">
                      Type a question or upload a photo. Get one step at a time —
                      with hints and checks along the way.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">
                    Parents like it because:
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    It replaces guesswork
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    You can see what’s done, what’s next, and what needs review.
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">
                    Students like it because:
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    It feels doable
                  </div>
                  <div className="mt-1 text-xs text-slate-600">
                    Short lessons. Unlimited retries. Help the moment you’re stuck.
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section id="who-its-for" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Who it’s for"
            title="Three kinds of students. One place that fits."
            subtitle="Whether your child needs support, needs challenge, or just needs quick help sometimes — Brilliem keeps them moving forward."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <PersonaCard
              title="Falling behind"
              label="Catch up"
              subtitle="They’re missing a few building blocks — and everything after feels harder."
              accent="from-emerald-500 to-green-500"
              bullets={[
                "Start at the exact skill they missed (not a random chapter).",
                "Unlimited practice with explanations to close gaps quickly.",
                "Progress shows what’s mastered and what still needs review.",
              ]}
            />
            <PersonaCard
              title="Ahead of the class"
              label="Get challenged"
              subtitle="School moves too slowly — they need harder questions and deeper practice."
              accent="from-sky-500 to-blue-600"
              bullets={[
                "Work ahead by skill and unit (aligned to Alberta outcomes).",
                "Mixed practice to build speed + accuracy (not just easy drills).",
                "Unit tests + exam-style prep to prove readiness.",
              ]}
            />
            <PersonaCard
              title="Homework is “sometimes hard”"
              label="Instant help"
              subtitle="Most nights are fine — then one question stalls everything."
              accent="from-purple-500 to-fuchsia-600"
              bullets={[
                "Ask the AI tutor for a hint, then the next step, then the next.",
                "Upload a photo of the question for instant guidance.",
                "Better than answers: checks understanding as you go.",
              ]}
            />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What you get"
            title="A complete Alberta-aligned learning system"
            subtitle="Everything is mapped by grade → strand → unit → lesson. Students always know what to do next."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Card
              title="Lesson videos for every skill"
              desc="Short, clear teaching for each Alberta outcome — organized by grade, strand, and unit."
              accent="from-emerald-500 to-green-500"
              icon={<span className="text-lg">▶</span>}
            />
            <Card
              title="Unlimited practice questions"
              desc="Practice never runs out. Every question includes explanations so students learn from mistakes."
              accent="from-orange-500 to-pink-500"
              icon={<span className="text-lg">∞</span>}
            />
            <Card
              title="Progress tracking that actually helps"
              desc="See lesson grades, unit readiness, and what to review next — so studying is focused (not random)."
              accent="from-sky-500 to-blue-600"
              icon={<span className="text-lg">📈</span>}
            />
            <Card
              title="Unit tests + readiness checks"
              desc="Students can test themselves when ready — and get clear guidance on what to fix before retrying."
              accent="from-red-500 to-rose-600"
              icon={<span className="text-lg">✓</span>}
            />
            <Card
              title="PAT & Diploma-style practice"
              desc="Exam-style questions for test prep, plus targeted review based on weak areas."
              accent="from-amber-500 to-orange-600"
              icon={<span className="text-lg">📝</span>}
            />
            <Card
              title="AI tutor for math + science"
              desc="Get step-by-step solutions one step at a time. Upload images for instant homework help."
              accent="from-purple-500 to-fuchsia-600"
              icon={<span className="text-lg">✨</span>}
            />
          </div>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 shadow-sm">
            <div className="grid gap-6 md:grid-cols-3 md:items-center">
              <div className="md:col-span-2">
                <h3 className="text-xl font-bold text-slate-900">
                  Help that saves time (and tutoring money)
                </h3>
                <p className="mt-3 text-sm text-slate-600">
                  When a student is stuck, the best moment to get help is right now —
                  not next week. Brilliem gives instant, guided support without
                  spoiling the learning.
                </p>
                <ul className="mt-5 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                  {[
                    "Hints first — then steps (not a dump of the answer)",
                    "Checks understanding as you go",
                    "Photo upload for textbook questions",
                    "Support for Math + Science questions",
                  ].map((x, i) => (
                    <li
                      key={i}
                      className="rounded-2xl border border-slate-200 bg-white p-4"
                    >
                      <span className="font-semibold">•</span> {x}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="md:justify-self-end">
                <Link
                  href="/get-started"
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 md:w-auto"
                >
                  Try Brilliem
                </Link>
                <p className="mt-3 text-xs text-slate-500">
                  (You can wire this to your signup flow.)
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="How it works"
            title="A simple loop that builds confidence"
            subtitle="The goal isn’t “more work.” It’s the right work, at the right time."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white">
                  1
                </span>
                Learn
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Watch a short lesson (organized by Alberta skills) with clear steps
                and examples.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-green-500 text-white">
                  2
                </span>
                Practice
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Do unlimited questions with explanations. Fix mistakes immediately
                (before they become habits).
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white">
                  3
                </span>
                Prove it
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Track grades by lesson/unit/strand/grade, then take unit tests and
                exam-style questions when ready.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section id="testimonials" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Stories"
            title="Parents want clarity. Students want confidence."
            subtitle="A few examples of what families typically say after a few weeks of consistent practice."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {testimonials.map((t, idx) => (
              <div
                key={idx}
                className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div
                  className={`absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br ${t.color} opacity-15 blur-2xl`}
                />
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {t.name}
                    </div>
                    <div className="text-xs text-slate-500">{t.location}</div>
                  </div>
                  <span
                    className={`h-9 w-9 rounded-xl bg-gradient-to-br ${t.color} opacity-90`}
                    aria-hidden="true"
                  />
                </div>
                <p className="mt-4 text-sm leading-relaxed text-slate-700">
                  “{t.quote}”
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="FAQ"
            title="Quick answers"
            subtitle="Parents usually ask these first — so we answer them up front."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {[
              {
                q: "Is this aligned to Alberta curriculum?",
                a: "Yes. Lessons are organized by Alberta outcomes (skills → units → strands → grades), so it matches what students are expected to learn in school.",
                accent: "from-emerald-500 to-green-500",
              },
              {
                q: "Does the AI tutor just give the answer?",
                a: "No. It can guide step-by-step, one step at a time, with hints and checks — so students learn the process.",
                accent: "from-purple-500 to-fuchsia-600",
              },
              {
                q: "What if my child is ahead or behind?",
                a: "Both work. Students can start where they need to (to catch up) or move ahead by unit (to stay challenged).",
                accent: "from-sky-500 to-blue-600",
              },
              {
                q: "What practice and tests are included?",
                a: "Unlimited practice questions with explanations, unit tests, readiness checks, and PAT/Diploma-style practice questions for exam prep.",
                accent: "from-orange-500 to-pink-500",
              },
            ].map((item, idx) => (
              <div
                key={idx}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-1 h-6 w-6 rounded-lg bg-gradient-to-br ${item.accent}`}
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {item.q}
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-12 rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-10 text-center shadow-sm">
            <h3 className="text-2xl font-bold tracking-tight text-slate-900">
              Ready for calmer homework and stronger grades?
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600">
              Brilliem supports students with clear Alberta-aligned lessons, unlimited
              practice with explanations, progress tracking, and instant step-by-step help.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/get-started"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Get started
              </Link>
              <Link
                href="#who-its-for"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
              >
                See who it helps
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
