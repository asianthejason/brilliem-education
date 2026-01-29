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
      "The practice questions feel like they match exactly what was taught. When I’m stuck, I tap the button and it jumps to the right part of the video.",
    color: "from-orange-500 to-pink-500",
  },
  {
    name: "Noah K.",
    location: "Halifax, NS",
    quote:
      "My kid stopped dreading math. The lessons are short, the steps are clear, and the feedback is immediate.",
    color: "from-emerald-500 to-green-500",
  },
  {
    name: "Mia R.",
    location: "Kelowna, BC",
    quote:
      "I love how it tracks what I’m good at vs what I need to review. It feels like studying with a plan instead of guessing.",
    color: "from-sky-500 to-blue-600",
  },
  {
    name: "Ethan S.",
    location: "Waterloo, ON",
    quote:
      "The chatbot helps me understand my mistake without just giving the answer. It’s like having a tutor on call.",
    color: "from-purple-500 to-fuchsia-600",
  },
  {
    name: "Sophia T.",
    location: "Saskatoon, SK",
    quote:
      "Unit tests are fair and actually reflect what the lessons covered. It’s the first time I felt ready before a test.",
    color: "from-red-500 to-rose-600",
  },
  {
    name: "Liam P.",
    location: "Whitehorse, YT",
    quote:
      "The mix of videos + practice works. I can do a quick session daily and see real progress.",
    color: "from-amber-500 to-orange-600",
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
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full bg-gradient-to-br opacity-15 blur-2xl transition group-hover:opacity-25" />
      <div className={`absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${accent} opacity-15 blur-2xl`} />
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
          <ColorDot className="from-orange-500 to-pink-500" />
          <ColorDot className="from-emerald-500 to-green-500" />
          <ColorDot className="from-sky-500 to-blue-600" />
          <ColorDot className="from-purple-500 to-fuchsia-600" />
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

export default function HomePage() {

  return (
    <main className="bg-white">
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-[-180px] h-[420px] w-[900px] -translate-x-1/2 rounded-full bg-gradient-to-r from-orange-500 via-sky-500 to-purple-600 opacity-15 blur-3xl" />
          <div className="absolute left-[-120px] top-[240px] h-[320px] w-[320px] rounded-full bg-gradient-to-br from-emerald-500 to-green-500 opacity-15 blur-3xl" />
          <div className="absolute right-[-140px] top-[360px] h-[360px] w-[360px] rounded-full bg-gradient-to-br from-red-500 to-rose-600 opacity-10 blur-3xl" />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div>
              <h1 className="text-5xl font-bold tracking-tight text-slate-900 md:text-6xl">
                Ace Alberta Math
              </h1>

              <div className="mt-3 text-xl font-semibold text-slate-700 md:text-2xl">
                Clear lessons | Unlimited practices | Real progress
              </div>

              <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
                StemX Academy gives Alberta-aligned lesson videos for every skill, unit, and
                grade — plus unlimited practice with explanations, progress tracking,
                unit tests, PAT/Diploma-style prep, and an AI tutor that teaches{" "}
                <span className="font-semibold text-slate-800">one step at a time</span>{" "}
                (so students learn, not just copy answers).
              </p>

              <div id="get-started" className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="#features"
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  See who it helps
                </Link>
                <Link
                  href="#features"
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
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

            <div className="relative">
              <div className="grid gap-3">
                {/* 1) Micro-lesson */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">
                      Watch a micro-lesson
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

                {/* 2) Unlimited practice */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">
                      Unlimited practice questions
                    </div>
                    <span className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600">
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

                {/* 3) Readiness */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-slate-900">
                      Readiness check
                    </div>
                    <span className="rounded-full bg-gradient-to-r from-emerald-500 to-green-500 px-2 py-1 text-[11px] font-semibold text-white">
                      ready soon
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2">
                    {[
                      ["Divisible means + quick tests (2, 5, 10)", "84%"],
                      ["Divisibility by 3 and 9 (digit sums)", "71%"],
                      ["Prime vs composite numbers", "N/A"],
                    ].map(([name, pct], idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="text-xs font-medium text-slate-800">
                          {name}
                        </div>
                        <div className="text-xs font-semibold text-slate-600">
                          {pct}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Parents / Students like */}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">
                    Parents like it because:
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    It replaces guesswork
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-600">
                    You can see what’s done, what’s next, and what to review — so
                    support is targeted and efficient.
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="text-xs font-semibold text-slate-500">
                    Students like it because:
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    It feels doable
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-slate-600">
                    Short lessons. Unlimited retries. Help right when you’re stuck.
                    Progress shows “ready / not yet.”
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEMS + SOLUTIONS */}
      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Why StemX Academy"
            title="The common problems — solved with a simple loop"
            subtitle="Most students don’t need more hours. They need clearer explanations, targeted practice, and help at the exact moment they’re stuck."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <Card
              title="“I watched the lesson… but I still can’t do the questions.”"
              desc="We connect each question to the exact video moment that teaches it, so students can instantly re-learn what they missed."
              accent="from-sky-500 to-blue-600"
              icon={<span className="text-lg">↺</span>}
            />
            <Card
              title="“Practice never matches what’s on the test.”"
              desc="Practice and unit tests are built from the same skill map, so students train the exact concepts they’ll be assessed on."
              accent="from-emerald-500 to-green-500"
              icon={<span className="text-lg">✓</span>}
            />
            <Card
              title="“We don’t know what to review.”"
              desc="Progress highlights strengths, weak spots, and next steps — so studying is focused, not random."
              accent="from-purple-500 to-fuchsia-600"
              icon={<span className="text-lg">◎</span>}
            />
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="What you get"
            title="Everything you need to learn — in one place"
            subtitle="Start with Math, then scale into more subjects over time. The experience stays consistent: learn, practice, master."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <Card
              title="Short, clear video lessons"
              desc="Concise teaching that gets to the point. No searching through long videos to find the one step you need."
              accent="from-orange-500 to-pink-500"
              icon={<span className="text-lg">▶</span>}
            />
            <Card
              title="Practice that changes every time"
              desc="AI-generated variants keep practice fresh while staying aligned to the skill being taught."
              accent="from-emerald-500 to-green-500"
              icon={<span className="text-lg">⚡</span>}
            />
            <Card
              title="Instant “Watch explanation” links"
              desc="Each question links to the right chapter in the lesson, so help is one tap away."
              accent="from-sky-500 to-blue-600"
              icon={<span className="text-lg">⏱</span>}
            />
            <Card
              title="Unit tests + readiness checks"
              desc="End-of-unit assessments plus guidance on exactly what to review before you try again."
              accent="from-red-500 to-rose-600"
              icon={<span className="text-lg">🧠</span>}
            />
            <Card
              title="Built-in AI tutor"
              desc="Ask questions by typing or uploading a photo. Get hints, explanations, and step-by-step support."
              accent="from-purple-500 to-fuchsia-600"
              icon={<span className="text-lg">💬</span>}
            />
            <Card
              title="Progress you can actually use"
              desc="See mastery by topic, what’s improving, and what needs a quick review next."
              accent="from-amber-500 to-orange-600"
              icon={<span className="text-lg">📈</span>}
            />
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="How it works"
            title="A simple system that builds confidence"
            subtitle="Students make steady progress because the next step is always obvious."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 text-white">
                  1
                </span>
                Watch
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Learn one concept at a time with short, focused lessons and
                chapters.
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
                Answer questions that match the lesson. Get instant feedback and
                retry until it sticks.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 text-white">
                  3
                </span>
                Master
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Review weak spots automatically, then take unit tests when you’re
                ready.
              </p>
            </div>
          </div>

          <div className="mt-10 rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-8 shadow-sm">
            <div className="grid gap-6 md:grid-cols-3 md:items-center">
              <div className="md:col-span-2">
                <h3 className="text-xl font-bold text-slate-900">
                  Taglines that match the experience
                </h3>
                <ul className="mt-4 grid gap-3 text-sm text-slate-700 md:grid-cols-2">
                  <li className="rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="font-semibold">Learn with clarity.</span>{" "}
                    Practice with purpose.
                  </li>
                  <li className="rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="font-semibold">Stop guessing.</span> Start
                    mastering.
                  </li>
                  <li className="rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="font-semibold">Help in one tap.</span>{" "}
                    Right where you’re stuck.
                  </li>
                  <li className="rounded-2xl border border-slate-200 bg-white p-4">
                    <span className="font-semibold">Confidence built daily.</span>{" "}
                    Minutes at a time.
                  </li>
                </ul>
              </div>

              <div className="md:justify-self-end">
                <Link
                  href="/get-started"
                  className="inline-flex w-full items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 md:w-auto"
                >
                  Start exploring StemX Academy
                </Link>
                <p className="mt-3 text-xs text-slate-500">
                  (Signup flow can be added next.)
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section
        id="testimonials"
        className="border-t border-slate-200 bg-white"
      >
        <div className="mx-auto max-w-6xl px-4 py-16">
          <SectionHeading
            eyebrow="Stories"
            title="What students and parents say"
            subtitle="Made-up examples for now — we’ll swap these for real feedback as you launch."
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
            subtitle="You’ll refine these as the product takes shape — this gives visitors confidence right away."
          />

          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {[
              {
                q: "What grades do you support?",
                a: "We’re starting with Math and expanding grade-by-grade. The long-term goal is Grades 1–12 across multiple subjects.",
                accent: "from-orange-500 to-pink-500",
              },
              {
                q: "Is this aligned to Alberta curriculum?",
                a: "Yes — lessons are designed to match Alberta learning outcomes, with practice built from the same skill map.",
                accent: "from-emerald-500 to-green-500",
              },
              {
                q: "How is StemX Academy different from random worksheets?",
                a: "Each question is tied to the exact part of the lesson that teaches it. Students don’t waste time searching for help.",
                accent: "from-sky-500 to-blue-600",
              },
              {
                q: "Does the AI just give answers?",
                a: "The goal is learning. The tutor can provide hints and step-by-step explanations, not just final answers.",
                accent: "from-purple-500 to-fuchsia-600",
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
              Ready to build confidence in math?
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-base text-slate-600">
              StemX Academy helps students learn faster with clear lessons,
              targeted practice, and instant support — all in one place.
            </p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link
                href="/get-started"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Get started
              </Link>
              <Link
                href="#features"
                className="inline-flex items-center justify-center rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                See features
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
