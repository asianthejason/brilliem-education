export type Question = {
  id: string;
  lessonId: string;
  prompt: string;
  // canonical answer string used by the checker (normalized)
  answer: string;
  // optional alternate answers (also normalized)
  acceptedAnswers?: string[];
  reasoning: string;
  source: "bank" | "ai";
  inputPlaceholder?: string;
};

function nrm(s: string) {
  return (s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/,/g, "");
}

function q(
  lessonId: string,
  id: string,
  prompt: string,
  answerRaw: string,
  reasoning: string,
  accepted?: string[]
): Question {
  return {
    id,
    lessonId,
    prompt,
    answer: nrm(answerRaw),
    acceptedAnswers: accepted?.map(nrm),
    reasoning,
    source: "bank",
  };
}

/**
 * Finite question bank per lesson.
 *
 * Philosophy:
 * - enough variety to practice without calling AI
 * - still finite, so the app can switch to AI after the bank is exhausted
 */
export function getBankForLesson(lessonId: string): Question[] {
  switch (lessonId) {
    case "g7-n1-div-2-5-10":
      return bankDiv_2_5_10();
    case "g7-n1-div-3-9":
      return bankDiv_3_9();
    case "g7-n1-div-4-8":
      return bankDiv_4_8();
    case "g7-n1-div-6":
      return bankDiv_6();
    case "g7-n1-factors-fast":
      return bankFactorsFast();
    case "g7-n1-factor-trees":
      return bankFactorTrees();
    case "g7-n1-sort-venn":
      return bankSortVenn();
    default:
      return proceduralBankForLesson(lessonId);
  }
}

export function checkAnswer(question: Question, userInput: string): boolean {
  const u = nrm(userInput);
  if (!u) return false;
  if (u === question.answer) return true;
  return Array.isArray(question.acceptedAnswers) && question.acceptedAnswers.includes(u);
}

// ----------------
// Grade 7 — Unit N1
// ----------------

function bankDiv_2_5_10(): Question[] {
  const nums = [18, 35, 70, 99, 120, 405, 502, 1000, 1462, 3715, 8008, 930, 250, 875, 2205, 4810];
  const out: Question[] = [];
  let i = 0;

  for (const n of nums) {
    out.push(
      q(
        "g7-n1-div-2-5-10",
        `g7-n1-2-5-10-${i++}`,
        `Is **${n}** divisible by **2**? (Answer: yes/no)` ,
        n % 2 === 0 ? "yes" : "no",
        `A number is divisible by 2 if its last digit is 0, 2, 4, 6, or 8. ${n} ends in **${String(n).slice(-1)}**, so the answer is **${n % 2 === 0 ? "yes" : "no"}**.`
      )
    );
    out.push(
      q(
        "g7-n1-div-2-5-10",
        `g7-n1-2-5-10-${i++}`,
        `Is **${n}** divisible by **5**? (Answer: yes/no)` ,
        n % 5 === 0 ? "yes" : "no",
        `A number is divisible by 5 if it ends in **0** or **5**. ${n} ends in **${String(n).slice(-1)}**, so the answer is **${n % 5 === 0 ? "yes" : "no"}**.`
      )
    );
    out.push(
      q(
        "g7-n1-div-2-5-10",
        `g7-n1-2-5-10-${i++}`,
        `Is **${n}** divisible by **10**? (Answer: yes/no)` ,
        n % 10 === 0 ? "yes" : "no",
        `A number is divisible by 10 if it ends in **0**. ${n} ends in **${String(n).slice(-1)}**, so the answer is **${n % 10 === 0 ? "yes" : "no"}**.`
      )
    );
  }

  // A couple of “choose all” style (entered as comma-separated list)
  const set = [105, 110, 125, 140, 153, 208, 315, 902];
  const div2 = set.filter((x) => x % 2 === 0).join(",");
  const div5 = set.filter((x) => x % 5 === 0).join(",");
  const div10 = set.filter((x) => x % 10 === 0).join(",");
  out.push(
    q(
      "g7-n1-div-2-5-10",
      `g7-n1-2-5-10-${i++}`,
      `From this list: **${set.join(", ")}**, type the numbers divisible by **2** (comma-separated).`,
      div2,
      `Divisible by 2 ⟶ last digit 0/2/4/6/8. Those are: **${div2.split(",").join(", ")}**.`,
      [div2.split(",").sort().join(",")]
    )
  );
  out.push(
    q(
      "g7-n1-div-2-5-10",
      `g7-n1-2-5-10-${i++}`,
      `From this list: **${set.join(", ")}**, type the numbers divisible by **5** (comma-separated).`,
      div5,
      `Divisible by 5 ⟶ last digit 0 or 5. Those are: **${div5.split(",").join(", ")}**.`,
      [div5.split(",").sort().join(",")]
    )
  );
  out.push(
    q(
      "g7-n1-div-2-5-10",
      `g7-n1-2-5-10-${i++}`,
      `From this list: **${set.join(", ")}**, type the numbers divisible by **10** (comma-separated).`,
      div10,
      `Divisible by 10 ⟶ last digit 0. Those are: **${div10.split(",").join(", ")}**.`,
      [div10.split(",").sort().join(",")]
    )
  );

  return out;
}

function sumDigits(n: number): number {
  return String(Math.abs(n))
    .split("")
    .reduce((acc, ch) => acc + (ch >= "0" && ch <= "9" ? Number(ch) : 0), 0);
}

function bankDiv_3_9(): Question[] {
  const nums = [27, 81, 114, 221, 306, 519, 1008, 1116, 1458, 2002, 999, 1001, 12345, 5556];
  const out: Question[] = [];
  let i = 0;
  for (const n of nums) {
    const s = sumDigits(n);
    out.push(
      q(
        "g7-n1-div-3-9",
        `g7-n1-3-9-${i++}`,
        `Is **${n}** divisible by **3**? (yes/no)`,
        s % 3 === 0 ? "yes" : "no",
        `Add the digits: ${String(n).split("").join(" + ")} = **${s}**. Since **${s} ${s % 3 === 0 ? "is" : "is not"}** divisible by 3, **${n} ${s % 3 === 0 ? "is" : "is not"}** divisible by 3.`
      )
    );
    out.push(
      q(
        "g7-n1-div-3-9",
        `g7-n1-3-9-${i++}`,
        `Is **${n}** divisible by **9**? (yes/no)`,
        s % 9 === 0 ? "yes" : "no",
        `Digit sum is **${s}**. A number is divisible by 9 if its digit sum is divisible by 9. ${s} ${s % 9 === 0 ? "is" : "is not"} divisible by 9, so the answer is **${s % 9 === 0 ? "yes" : "no"}**.`
      )
    );
  }
  return out;
}

function lastTwo(n: number): number {
  const s = String(Math.abs(n));
  return Number(s.slice(-2));
}

function lastThree(n: number): number {
  const s = String(Math.abs(n));
  return Number(s.slice(-3));
}

function bankDiv_4_8(): Question[] {
  const nums = [124, 256, 312, 405, 768, 1004, 1232, 2048, 3001, 4416, 5508, 6172, 9996];
  const out: Question[] = [];
  let i = 0;
  for (const n of nums) {
    const l2 = lastTwo(n);
    const l3 = lastThree(n);
    out.push(
      q(
        "g7-n1-div-4-8",
        `g7-n1-4-8-${i++}`,
        `Is **${n}** divisible by **4**? (yes/no)`,
        l2 % 4 === 0 ? "yes" : "no",
        `Check the last 2 digits. The last two digits are **${String(n).slice(-2)}** (which is ${l2}). Since **${l2} ${l2 % 4 === 0 ? "is" : "is not"}** divisible by 4, the answer is **${l2 % 4 === 0 ? "yes" : "no"}**.`
      )
    );
    out.push(
      q(
        "g7-n1-div-4-8",
        `g7-n1-4-8-${i++}`,
        `Is **${n}** divisible by **8**? (yes/no)`,
        l3 % 8 === 0 ? "yes" : "no",
        `Check the last 3 digits. The last three digits are **${String(n).slice(-3)}** (which is ${l3}). Since **${l3} ${l3 % 8 === 0 ? "is" : "is not"}** divisible by 8, the answer is **${l3 % 8 === 0 ? "yes" : "no"}**.`
      )
    );
  }
  return out;
}

function bankDiv_6(): Question[] {
  const nums = [12, 18, 21, 24, 30, 42, 48, 66, 75, 84, 96, 102, 111, 120, 126, 135, 144];
  const out: Question[] = [];
  let i = 0;
  for (const n of nums) {
    const is2 = n % 2 === 0;
    const is3 = sumDigits(n) % 3 === 0;
    out.push(
      q(
        "g7-n1-div-6",
        `g7-n1-6-${i++}`,
        `Is **${n}** divisible by **6**? (yes/no)`,
        is2 && is3 ? "yes" : "no",
        `A number is divisible by 6 if it’s divisible by **2 and 3**. ${n} is ${is2 ? "" : "not "}divisible by 2 and ${is3 ? "" : "not "}divisible by 3, so the answer is **${is2 && is3 ? "yes" : "no"}**.`
      )
    );
  }
  return out;
}

function factorsOf(n: number): number[] {
  const out: number[] = [];
  for (let i = 1; i * i <= n; i++) {
    if (n % i === 0) {
      out.push(i);
      if (i !== n / i) out.push(n / i);
    }
  }
  return out.sort((a, b) => a - b);
}

function bankFactorsFast(): Question[] {
  const nums = [36, 48, 60, 72, 84, 90, 96, 120];
  const out: Question[] = [];
  let i = 0;
  for (const n of nums) {
    const f = factorsOf(n);
    out.push(
      q(
        "g7-n1-factors-fast",
        `g7-n1-factors-${i++}`,
        `List **all factors** of **${n}** (comma-separated, smallest to largest).`,
        f.join(","),
        `To find factors, test divisibility up to \(\sqrt{${n}}\), then pair factors: if \(a\times b=${n}\), both a and b are factors. The full list is: **${f.join(", ")}**.`,
        [f.slice().sort((a, b) => a - b).join(",")]
      )
    );
  }
  return out;
}

function bankFactorTrees(): Question[] {
  const nums = [18, 24, 30, 36, 42, 48, 54, 60, 72, 84, 90, 96, 120];
  const out: Question[] = [];
  let i = 0;

  const primeFactorization = (n: number): number[] => {
    let x = n;
    const pf: number[] = [];
    let p = 2;
    while (p * p <= x) {
      while (x % p === 0) {
        pf.push(p);
        x = Math.floor(x / p);
      }
      p++;
    }
    if (x > 1) pf.push(x);
    return pf;
  };

  for (const n of nums) {
    const pf = primeFactorization(n);
    const ans = pf.join("×");
    out.push(
      q(
        "g7-n1-factor-trees",
        `g7-n1-pf-${i++}`,
        `Write the **prime factorization** of **${n}** using multiplication signs (example format: 2×2×3).`,
        ans,
        `Break ${n} into factors until all numbers are prime. One valid prime factorization is **${ans}**.`
      )
    );
  }

  return out;
}

function bankSortVenn(): Question[] {
  // Venn sorting using properties: divisible by 2, divisible by 3.
  const out: Question[] = [];
  let i = 0;

  const sets = [
    [6, 9, 10, 12, 15, 18, 21, 25],
    [14, 16, 18, 20, 22, 24, 27, 30],
    [3, 4, 6, 8, 9, 12, 16, 21],
  ];

  for (const list of sets) {
    const both = list.filter((n) => n % 2 === 0 && n % 3 === 0);
    const only2 = list.filter((n) => n % 2 === 0 && n % 3 !== 0);
    const only3 = list.filter((n) => n % 3 === 0 && n % 2 !== 0);
    const neither = list.filter((n) => n % 2 !== 0 && n % 3 !== 0);

    out.push(
      q(
        "g7-n1-sort-venn",
        `g7-n1-venn-${i++}`,
        `Numbers: **${list.join(", ")}**\n\nSort into 4 groups (comma-separated lists):\n1) divisible by 2 only\n2) divisible by 3 only\n3) divisible by both 2 and 3\n4) divisible by neither\n\nAnswer format: 2only:a,b;3only:c;both:d;neither:e`,
        `2only:${only2.join(",")};3only:${only3.join(",")};both:${both.join(",")};neither:${neither.join(",")}`,
        `Divisible by 2 ⟶ even numbers. Divisible by 3 ⟶ digit sum multiple of 3.\n\n2 only: **${only2.join(", ")}**\n3 only: **${only3.join(", ")}**\nBoth: **${both.join(", ")}**\nNeither: **${neither.join(", ")}**`
      )
    );
  }

  return out;
}

// ----------------
// Procedural banks (Grade 7)
// ----------------
// These banks are deterministic (seeded by lessonId), finite, and require no AI.
// They exist so every lesson can immediately have usable practice.

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seedStr: string) {
  let x = hashSeed(seedStr) || 1;
  return () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
}

function rint(rng: () => number, a: number, b: number): number {
  return a + Math.floor(rng() * (b - a + 1));
}

function choice<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function roundTo(n: number, places: number) {
  const m = Math.pow(10, places);
  return Math.round(n * m) / m;
}

function qAuto(
  lessonId: string,
  idx: number,
  prompt: string,
  answerRaw: string,
  reasoning: string,
  accepted?: string[],
  inputPlaceholder?: string
): Question {
  return {
    id: `${lessonId}-bank-${idx}`,
    lessonId,
    prompt,
    answer: nrm(answerRaw),
    acceptedAnswers: accepted?.map(nrm),
    reasoning,
    source: "bank",
    inputPlaceholder,
  };
}

function proceduralBankForLesson(lessonId: string): Question[] {
  if (lessonId.startsWith("g7-ss1-")) return bankCircles(lessonId);
  if (lessonId.startsWith("g7-ss2-")) return bankArea(lessonId);
  if (lessonId.startsWith("g7-ss3-")) return bankConstructions(lessonId);
  if (lessonId.startsWith("g7-ss4-")) return bankTransformations(lessonId);

  if (lessonId.startsWith("g7-n2-")) return bankDecimals(lessonId);
  if (lessonId.startsWith("g7-n3-")) return bankPercent(lessonId);
  if (lessonId.startsWith("g7-n4-")) return bankBedmas(lessonId);
  if (lessonId.startsWith("g7-n5-")) return bankFracDec(lessonId);
  if (lessonId.startsWith("g7-n6-")) return bankFracAddSub(lessonId);
  if (lessonId.startsWith("g7-n7-")) return bankIntegers(lessonId);

  if (lessonId.startsWith("g7-pr1-")) return bankLinearPatterns(lessonId);
  if (lessonId.startsWith("g7-pr2-")) return bankExpressions(lessonId);

  if (lessonId.startsWith("g7-sp1-")) return bankDataAnalysis(lessonId);
  if (lessonId.startsWith("g7-sp2-")) return bankProbability(lessonId);

  return [];
}

// ----------------
// Shape and Space — SS1: Circles
// ----------------
function bankCircles(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;
  const PI = 3.14;

  if (lessonId === "g7-ss1-rel") {
    for (let k = 0; k < 14; k++) {
      const r = rint(rng, 2, 18);
      const d = 2 * r;
      const mode = choice(rng, ["d_from_r", "r_from_d"] as const);
      if (mode === "d_from_r") {
        out.push(
          qAuto(
            lessonId,
            i++,
            `A circle has radius **${r}**. What is its diameter? (number)`,
            String(d),
            `Diameter is **2 × radius**. So d = 2×${r} = **${d}**.`,
            undefined,
            "number"
          )
        );
      } else {
        out.push(
          qAuto(
            lessonId,
            i++,
            `A circle has diameter **${d}**. What is its radius? (number)`,
            String(r),
            `Radius is **half the diameter**. So r = ${d} ÷ 2 = **${r}**.`,
            undefined,
            "number"
          )
        );
      }
    }
    return out;
  }

  if (lessonId === "g7-ss1-pi") {
    for (let k = 0; k < 12; k++) {
      const d = rint(rng, 4, 22);
      const c = roundTo(PI * d, 1);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Using **π ≈ 3.14**, estimate the circumference of a circle with diameter **${d}**. (1 decimal place)`,
          c.toFixed(1),
          `π is the ratio **C ÷ d**. So C ≈ π·d ≈ 3.14×${d} = **${c.toFixed(1)}**.`,
          [String(c)],
          "1 decimal"
        )
      );
    }

    out.push(
      qAuto(
        lessonId,
        i++,
        `A circle has circumference **31.4** and diameter **10**. What is **C ÷ d**? (2 decimals)`,
        "3.14",
        `Compute the ratio: 31.4 ÷ 10 = **3.14**. That constant ratio is π (approximately).`,
        ["3.140"],
        "number"
      )
    );

    return out;
  }

  if (lessonId === "g7-ss1-formula") {
    for (let k = 0; k < 14; k++) {
      const r = rint(rng, 2, 18);
      const d = 2 * r;
      const cFromD = roundTo(PI * d, 1);
      const mode = choice(rng, ["c_from_r", "d_from_c"] as const);

      if (mode === "c_from_r") {
        const c = roundTo(2 * PI * r, 1);
        out.push(
          qAuto(
            lessonId,
            i++,
            `Using **π ≈ 3.14**, find the circumference when radius is **${r}**. (1 decimal)`,
            c.toFixed(1),
            `C = 2πr. So C ≈ 2×3.14×${r} = **${c.toFixed(1)}**.`,
            [String(c)],
            "1 decimal"
          )
        );
      } else {
        const dEst = roundTo(cFromD / PI, 1);
        out.push(
          qAuto(
            lessonId,
            i++,
            `A circle has circumference **${cFromD.toFixed(1)}**. Using **π ≈ 3.14**, estimate the diameter. (1 decimal)`,
            dEst.toFixed(1),
            `Use C = πd → d = C ÷ π ≈ ${cFromD.toFixed(1)} ÷ 3.14 = **${dEst.toFixed(1)}**.`,
            [String(d)],
            "1 decimal"
          )
        );
      }
    }
    return out;
  }

  if (lessonId === "g7-ss1-angles") {
    // Missing angle questions
    while (out.length < 12) {
      const a = rint(rng, 25, 170);
      const b = rint(rng, 25, 170);
      const c = rint(rng, 25, 170);
      const missing = 360 - (a + b + c);
      if (missing < 15 || missing > 210) continue;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Three central angles are **${a}°**, **${b}°**, and **${c}°**. What is the missing angle so they add to **360°**?`,
          String(missing),
          `A full turn is **360°**. Missing = 360 − (${a}+${b}+${c}) = **${missing}°**.`,
          undefined,
          "degrees"
        )
      );
    }

    // Fraction of circle
    out.push(
      qAuto(
        lessonId,
        i++,
        `A sector has a central angle of **90°**. What fraction of the circle is that? (fraction)`,
        "1/4",
        `90° out of 360° is 90/360 = **1/4** of the circle.`,
        ["0.25"],
        "fraction"
      )
    );
    return out;
  }

  if (lessonId === "g7-ss1-construct") {
    const statements = [
      {
        p: "To construct a circle of radius 6 cm, set the compass width to 6 cm. (yes/no)",
        a: "yes",
        r: "A radius is the distance from the center to the circle. Set the compass width to that distance.",
        ph: "yes/no",
      },
      {
        p: "If the diameter is 10 cm, should the compass width be 10 cm? (yes/no)",
        a: "no",
        r: "Compass width should be the **radius**, which is half the diameter (10 ÷ 2 = 5).",
        ph: "yes/no",
      },
      {
        p: "Pick the tool used to draw a circle: compass or protractor? (one word)",
        a: "compass",
        r: "A compass draws circles; a protractor measures angles.",
        ph: "one word",
        acc: ["acompass"],
      },
      {
        p: "When constructing a circle, do you keep the compass point fixed at the center? (yes/no)",
        a: "yes",
        r: "The sharp point stays at the center while the pencil traces the circle.",
        ph: "yes/no",
      },
    ] as const;

    for (const s of statements) {
      out.push(qAuto(lessonId, i++, s.p, s.a, s.r, (s as any).acc, s.ph));
    }

    while (out.length < 12) {
      const d = rint(rng, 6, 28);
      if (d % 2) continue;
      const r = d / 2;
      out.push(
        qAuto(
          lessonId,
          i++,
          `You need a circle with diameter **${d}**. What compass width (radius) should you set? (number)`,
          String(r),
          `Compass width is the radius. Radius = diameter ÷ 2 = ${d} ÷ 2 = **${r}**.`,
          undefined,
          "number"
        )
      );
    }

    return out;
  }

  return [];
}

// ----------------
// Shape and Space — SS2: Area formulas
// ----------------
function bankArea(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;
  const PI = 3.14;

  if (lessonId === "g7-ss2-tri") {
    for (let k = 0; k < 14; k++) {
      const b = rint(rng, 4, 20);
      const h = rint(rng, 4, 18);
      const area = (b * h) / 2;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Find the area of a triangle with base **${b}** and height **${h}**.`,
          String(area),
          `Triangle area is **½bh**. So A = ½×${b}×${h} = **${area}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss2-par") {
    for (let k = 0; k < 14; k++) {
      const b = rint(rng, 4, 22);
      const h = rint(rng, 3, 18);
      const area = b * h;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Find the area of a parallelogram with base **${b}** and height **${h}**.`,
          String(area),
          `Parallelogram area is **base × height**. So A = ${b}×${h} = **${area}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss2-circle") {
    for (let k = 0; k < 14; k++) {
      const r = rint(rng, 2, 14);
      const area = roundTo(PI * r * r, 1);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Using **π ≈ 3.14**, find the area of a circle with radius **${r}**. (1 decimal)`,
          area.toFixed(1),
          `Circle area is **πr²**. So A ≈ 3.14×${r}² = **${area.toFixed(1)}**.`,
          [String(area)],
          "1 decimal"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss2-composite") {
    for (let k = 0; k < 12; k++) {
      const b = rint(rng, 6, 18);
      const h = rint(rng, 4, 14);
      const tri = (b * h) / 2;
      const rectW = rint(rng, 4, 16);
      const rectH = rint(rng, 4, 14);
      const rect = rectW * rectH;
      const total = tri + rect;
      out.push(
        qAuto(
          lessonId,
          i++,
          `A shape is made from a rectangle (width **${rectW}**, height **${rectH}**) and a triangle (base **${b}**, height **${h}**). What is the total area?`,
          String(total),
          `Rectangle area: ${rectW}×${rectH} = ${rect}. Triangle area: ½×${b}×${h} = ${tri}. Total = ${rect}+${tri} = **${total}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Shape and Space — SS3: Constructions
// ----------------
function bankConstructions(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  const yn = (prompt: string, answer: "yes" | "no", reasoning: string) =>
    qAuto(lessonId, i++, prompt, answer, reasoning, undefined, "yes/no");

  if (lessonId === "g7-ss3-pbis") {
    out.push(yn("A perpendicular bisector crosses a segment at its midpoint. (yes/no)", "yes", "A bisector cuts something into two equal parts; perpendicular means 90°."));
    out.push(yn("A perpendicular bisector is always perpendicular to the segment. (yes/no)", "yes", "That’s what perpendicular means: it meets at 90°."));
    while (out.length < 12) {
      const len = rint(rng, 6, 30);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A segment is **${len}** cm long. A perpendicular bisector hits it at the midpoint. How far from either endpoint is the midpoint?`,
          String(len / 2),
          `Midpoint means half the length. ${len} ÷ 2 = **${len/2}**.`,
          [String(len/2)],
          "number"
        )
      );
      if (out.length >= 12) break;
    }
    return out;
  }

  if (lessonId === "g7-ss3-abis") {
    out.push(yn("An angle bisector splits an angle into two equal angles. (yes/no)", "yes", "Bisector means it divides into two equal parts."));
    out.push(yn("If an angle is 80°, each half after bisecting is 40°. (yes/no)", "yes", "80 ÷ 2 = 40."));
    while (out.length < 12) {
      const ang = choice(rng, [40, 50, 60, 70, 80, 90, 100, 120, 140]);
      out.push(
        qAuto(
          lessonId,
          i++,
          `An angle is **${ang}°**. If you bisect it, what is each new angle?`,
          String(ang / 2),
          `Bisect means split into two equal angles: ${ang} ÷ 2 = **${ang / 2}°**.`,
          undefined,
          "degrees"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss3-perp") {
    out.push(yn("A perpendicular line forms a 90° angle. (yes/no)", "yes", "Perpendicular means right angle."));
    out.push(yn("A protractor can be used to check a right angle. (yes/no)", "yes", "A protractor measures angles."));
    while (out.length < 12) {
      const a = choice(rng, [30, 45, 60, 75, 120, 135, 150]);
      const comp = 90 - a;
      out.push(
        qAuto(
          lessonId,
          i++,
          `One angle is **${a}°**. What angle makes it a right angle when added? (number)`,
          String(comp),
          `A right angle is 90°. Missing = 90 − ${a} = **${comp}°**.`,
          undefined,
          "degrees"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss3-parallel") {
    out.push(yn("Parallel lines never meet (in a flat plane). (yes/no)", "yes", "Parallel means same direction, constant distance apart."));
    out.push(yn("If two lines are parallel, corresponding angles are equal. (yes/no)", "yes", "That’s a key property with a transversal."));
    while (out.length < 12) {
      const ang = choice(rng, [35, 40, 55, 70, 110, 125, 140]);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Two parallel lines are cut by a transversal. If a corresponding angle is **${ang}°**, what is the matching corresponding angle?`,
          String(ang),
          `With parallel lines, **corresponding angles are equal**, so the angle is **${ang}°**.`,
          undefined,
          "degrees"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss3-challenge") {
    out.push(yn("To copy an angle, you can use a compass and straightedge. (yes/no)", "yes", "Many constructions can be done with compass + straightedge."));
    out.push(yn("A circle is determined by its center and radius. (yes/no)", "yes", "Center + radius fixes every point on the circle."));
    while (out.length < 12) {
      const len = rint(rng, 4, 20);
      out.push(
        qAuto(
          lessonId,
          i++,
          `You copy a segment of length **${len}** cm. How long is the copied segment?`,
          String(len),
          `A copy has the **same length**, so it is **${len}** cm.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Shape and Space — SS4: Cartesian plane & transformations
// ----------------
function bankTransformations(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  const fmt = (x: number, y: number) => `(${x},${y})`;

  if (lessonId === "g7-ss4-plot") {
    while (out.length < 14) {
      const x = rint(rng, -9, 9);
      const y = rint(rng, -9, 9);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A point is at x = **${x}**, y = **${y}**. Write the coordinate as an ordered pair (format: (x,y)).`,
          fmt(x, y),
          `An ordered pair lists **(x, y)**. So it is **${fmt(x, y)}**.`,
          undefined,
          "(x,y)"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss4-shapes") {
    for (let k = 0; k < 12; k++) {
      const x1 = rint(rng, -6, 2);
      const y1 = rint(rng, -6, 2);
      const w = rint(rng, 2, 6);
      const h = rint(rng, 2, 6);
      const area = w * h;
      out.push(
        qAuto(
          lessonId,
          i++,
          `A rectangle has vertices at ${fmt(x1, y1)} and ${fmt(x1 + w, y1 + h)} (opposite corners). What is its area?`,
          String(area),
          `Width = ${w}, height = ${h}. Area = ${w}×${h} = **${area}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss4-translate") {
    for (let k = 0; k < 14; k++) {
      const x = rint(rng, -8, 8);
      const y = rint(rng, -8, 8);
      const dx = choice(rng, [-5, -3, -2, 2, 3, 5]);
      const dy = choice(rng, [-5, -3, -2, 2, 3, 5]);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Translate point ${fmt(x, y)} by **(${dx}, ${dy})**. What is the new point? (x+dx, y+dy)`,
          fmt(x + dx, y + dy),
          `Add the translation to each coordinate: (${x}+${dx}, ${y}+${dy}) = **${fmt(x + dx, y + dy)}**.`,
          undefined,
          "(x,y)"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss4-reflect") {
    for (let k = 0; k < 14; k++) {
      const x = rint(rng, -9, 9);
      const y = rint(rng, -9, 9);
      const axis = choice(rng, ["x", "y"] as const);
      const nx = axis === "y" ? -x : x;
      const ny = axis === "x" ? -y : y;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Reflect point ${fmt(x, y)} across the **${axis}-axis**. What is the new point?`,
          fmt(nx, ny),
          axis === "x"
            ? `Across the x-axis, keep x the same and change the sign of y: (${x}, ${y}) → (${x}, ${-y}).`
            : `Across the y-axis, keep y the same and change the sign of x: (${x}, ${y}) → (${-x}, ${y}).`,
          undefined,
          "(x,y)"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss4-rotate") {
    for (let k = 0; k < 14; k++) {
      const x = rint(rng, -7, 7);
      const y = rint(rng, -7, 7);
      const deg = choice(rng, [90, 180] as const);
      const nx = deg === 90 ? -y : -x;
      const ny = deg === 90 ? x : -y;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Rotate point ${fmt(x, y)} **${deg}° counterclockwise** about the origin. What is the new point?`,
          fmt(nx, ny),
          deg === 90
            ? `A 90° CCW rotation maps (x, y) → (-y, x). So ${fmt(x, y)} → **${fmt(nx, ny)}**.`
            : `A 180° rotation maps (x, y) → (-x, -y). So ${fmt(x, y)} → **${fmt(nx, ny)}**.`,
          undefined,
          "(x,y)"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-ss4-multi") {
    for (let k = 0; k < 12; k++) {
      const x = rint(rng, -6, 6);
      const y = rint(rng, -6, 6);
      const dx = choice(rng, [-3, -2, 2, 3]);
      const dy = choice(rng, [-3, -2, 2, 3]);
      const tx = x + dx;
      const ty = y + dy;
      const rx = -tx; // reflect across y-axis
      const ry = ty;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Start at ${fmt(x, y)}. First translate by (${dx}, ${dy}), then reflect across the **y-axis**. What is the final point?`,
          fmt(rx, ry),
          `After translation: ${fmt(tx, ty)}. Reflect across y-axis flips x: (${tx}, ${ty}) → (${-tx}, ${ty}). Final: **${fmt(rx, ry)}**.`,
          undefined,
          "(x,y)"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Number — N2: Decimal operations
// ----------------
function bankDecimals(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  const d1 = () => roundTo(rint(rng, 10, 999) / 10, 1);
  const d2 = () => roundTo(rint(rng, 100, 9999) / 100, 2);

  if (lessonId === "g7-n2-estimation") {
    for (let k = 0; k < 14; k++) {
      const a = d1();
      const b = d1();
      const est = Math.round(a) + Math.round(b);
      const exact = roundTo(a + b, 1);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Estimate: round to the nearest whole number, then add. **${a} + ${b} ≈ ?**`,
          String(est),
          `Round: ${a} → ${Math.round(a)}, ${b} → ${Math.round(b)}. Add: ${Math.round(a)}+${Math.round(b)} = **${est}**. (Exact: ${exact}.)`,
          undefined,
          "whole number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n2-add-sub") {
    for (let k = 0; k < 14; k++) {
      const a = d1();
      const b = d1();
      const op = choice(rng, ["+", "-"] as const);
      const val = op === "+" ? roundTo(a + b, 1) : roundTo(a - b, 1);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Compute: **${a.toFixed(1)} ${op} ${b.toFixed(1)} = ?** (1 decimal)`,
          val.toFixed(1),
          `Line up decimal points, then ${op === "+" ? "add" : "subtract"}. Result: **${val.toFixed(1)}**.`,
          [String(val)],
          "1 decimal"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n2-multiply") {
    for (let k = 0; k < 14; k++) {
      const a = d1();
      const b = rint(rng, 2, 9);
      const val = roundTo(a * b, 1);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Compute: **${a.toFixed(1)} × ${b} = ?** (1 decimal)`,
          val.toFixed(1),
          `Multiply, then place the decimal. ${a.toFixed(1)}×${b} = **${val.toFixed(1)}**.`,
          [String(val)],
          "1 decimal"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n2-divide") {
    for (let k = 0; k < 14; k++) {
      const b = rint(rng, 2, 9);
      const val = d1();
      const a = roundTo(val * b, 1);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Compute: **${a.toFixed(1)} ÷ ${b} = ?** (1 decimal)`,
          val.toFixed(1),
          `Think: what number times ${b} equals ${a.toFixed(1)}? It is **${val.toFixed(1)}**.`,
          [String(val)],
          "1 decimal"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n2-word-problems") {
    for (let k = 0; k < 12; k++) {
      const price = d2();
      const qty = rint(rng, 2, 6);
      const total = roundTo(price * qty, 2);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A snack costs **$${price.toFixed(2)}**. You buy **${qty}**. How much do you pay? (2 decimals)`,
          total.toFixed(2),
          `Multiply: ${price.toFixed(2)}×${qty} = **$${total.toFixed(2)}**.`,
          [String(total)],
          "0.00"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Number — N3: Percent
// ----------------
function bankPercent(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  if (lessonId === "g7-n3-benchmarks") {
    const benches = [10, 25, 50, 75] as const;
    for (let k = 0; k < 14; k++) {
      const p = choice(rng, benches);
      const n = rint(rng, 20, 400);
      const ans = (p / 100) * n;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Find **${p}%** of **${n}**.`,
          String(ans),
          `${p}% means ${p}/100. So (${p}/100)×${n} = **${ans}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n3-conversions") {
    const fractionMap: Record<number, string> = {
      25: "1/4",
      50: "1/2",
      75: "3/4",
      20: "1/5",
      40: "2/5",
      10: "1/10",
    };

    const options = [5, 10, 12, 20, 25, 40, 50, 60, 75] as const;
    for (let k = 0; k < 16; k++) {
      const mode = choice(rng, ["p_to_dec", "dec_to_p", "p_to_frac"] as const);
      const p = choice(rng, options);

      if (mode === "p_to_dec") {
        const dec = p / 100;
        const ans = String(dec).replace(/0+$/, "").replace(/\.$/, "");
        out.push(
          qAuto(
            lessonId,
            i++,
            `Convert **${p}%** to a decimal.`,
            ans,
            `Divide by 100: ${p}% = ${p}/100 = **${ans}**.`,
            undefined,
            "decimal"
          )
        );
      } else if (mode === "dec_to_p") {
        const dec = p / 100;
        out.push(
          qAuto(
            lessonId,
            i++,
            `Convert **${dec}** to a percent.`,
            `${p}%`,
            `Multiply by 100: ${dec}×100 = **${p}%**.`,
            [String(p)],
            "percent"
          )
        );
      } else {
        const frac = fractionMap[p];
        if (!frac) continue;
        out.push(
          qAuto(
            lessonId,
            i++,
            `Convert **${p}%** to a fraction in simplest form.`,
            frac,
            `${p}% = ${p}/100. Reduce the fraction to simplest form: **${frac}**.`,
            undefined,
            "fraction"
          )
        );
      }
    }
    return out;
  }

  if (lessonId === "g7-n3-percent-of") {
    for (let k = 0; k < 14; k++) {
      const p = rint(rng, 5, 90);
      const n = rint(rng, 20, 500);
      const ans = roundTo((p / 100) * n, 2);
      const ansStr = ans.toString();
      out.push(
        qAuto(
          lessonId,
          i++,
          `Find **${p}%** of **${n}**. (round to 2 decimals if needed)`,
          ansStr,
          `${p}% of ${n} = (${p}/100)×${n} = **${ansStr}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n3-inc-dec") {
    for (let k = 0; k < 12; k++) {
      const price = rint(rng, 10, 120);
      const pct = choice(rng, [5, 10, 12, 15, 20, 25] as const);
      const mode = choice(rng, ["increase", "decrease"] as const);
      const change = roundTo((pct / 100) * price, 2);
      const newPrice = mode === "increase" ? roundTo(price + change, 2) : roundTo(price - change, 2);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A price is **$${price}**. It is a **${pct}% ${mode}**. What is the new price?`,
          newPrice.toString(),
          `Change = ${pct}% of ${price} = ${pct}/100×${price} = ${change}. ${mode === "increase" ? "Add" : "Subtract"}: ${price} ${mode === "increase" ? "+" : "-"} ${change} = **${newPrice}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n3-multi-step") {
    for (let k = 0; k < 10; k++) {
      const price = rint(rng, 20, 150);
      const disc = choice(rng, [10, 15, 20, 25] as const);
      const tax = choice(rng, [5, 10] as const);
      const afterDisc = roundTo(price * (1 - disc / 100), 2);
      const afterTax = roundTo(afterDisc * (1 + tax / 100), 2);
      out.push(
        qAuto(
          lessonId,
          i++,
          `An item costs **$${price}**. You get **${disc}% off**, then pay **${tax}% tax**. What is the final cost? (round to 2 decimals)`,
          afterTax.toString(),
          `After discount: ${price}×(1−${disc}/100) = ${afterDisc}. After tax: ${afterDisc}×(1+${tax}/100) = **${afterTax}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Number — N4: Order of operations (BEDMAS)
// ----------------
function bankBedmas(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  if (lessonId === "g7-n4-why" || lessonId === "g7-n4-no-brackets") {
    for (let k = 0; k < 16; k++) {
      const a = rint(rng, 2, 12);
      const b = rint(rng, 2, 12);
      const c = rint(rng, 2, 12);
      const expr = `${a} + ${b} × ${c}`;
      const ans = a + b * c;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Evaluate: **${expr}**`,
          String(ans),
          `Multiply first: ${b}×${c} = ${b * c}. Then add ${a}: ${a}+${b * c} = **${ans}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n4-exponents") {
    for (let k = 0; k < 14; k++) {
      const base = rint(rng, 2, 8);
      const exp = rint(rng, 2, 4);
      const ans = base ** exp;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Compute: **${base}^${exp}**`,
          String(ans),
          `${base}^${exp} means multiply ${base} by itself ${exp} times. Result: **${ans}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n4-brackets") {
    for (let k = 0; k < 14; k++) {
      const a = rint(rng, 2, 15);
      const b = rint(rng, 2, 12);
      const c = rint(rng, 2, 12);
      const ans = (a + b) * c;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Evaluate: **(${a} + ${b}) × ${c}**`,
          String(ans),
          `Brackets first: ${a}+${b} = ${a + b}. Then multiply by ${c}: ${a + b}×${c} = **${ans}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n4-context") {
    for (let k = 0; k < 12; k++) {
      const tickets = rint(rng, 3, 9);
      const price = rint(rng, 6, 15);
      const coupon = rint(rng, 3, 10);
      const ans = tickets * price - coupon;
      out.push(
        qAuto(
          lessonId,
          i++,
          `You buy **${tickets}** tickets at **$${price}** each and use a **$${coupon}** coupon. What is the total cost?`,
          String(ans),
          `Multiply first: ${tickets}×${price} = ${tickets * price}. Then subtract coupon: ${tickets * price}−${coupon} = **${ans}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Number — N5: Fractions ↔ decimals
// ----------------
function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function simp(n: number, d: number): [number, number] {
  const g = gcd(n, d);
  return [n / g, d / g];
}

function bankFracDec(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  if (lessonId === "g7-n5-term-to-frac") {
    for (let k = 0; k < 14; k++) {
      const denom = choice(rng, [10, 100, 1000] as const);
      const num = rint(rng, 1, denom - 1);
      const dec = num / denom;
      const [sn, sd] = simp(num, denom);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Convert the terminating decimal **${dec}** to a fraction in simplest form.`,
          `${sn}/${sd}`,
          `Write as a fraction with denominator ${denom}: ${dec} = ${num}/${denom}. Simplify to **${sn}/${sd}**.`,
          undefined,
          "fraction"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n5-frac-to-dec") {
    const fracs = [
      [1, 2],
      [1, 4],
      [3, 4],
      [1, 5],
      [2, 5],
      [3, 5],
      [1, 8],
      [3, 8],
      [5, 8],
      [7, 8],
    ] as const;
    for (let k = 0; k < 14; k++) {
      const [n, d] = choice(rng, fracs);
      const dec = roundTo(n / d, 3);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Convert **${n}/${d}** to a decimal.`,
          String(dec),
          `Divide numerator by denominator: ${n} ÷ ${d} = **${dec}**.`,
          undefined,
          "decimal"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n5-repeat") {
    // Keep to easy repeating decimals like 0.3̅, 0.6̅, 0.1̅2̅ etc.
    const reps = [
      { dec: "0.3", frac: "1/3" },
      { dec: "0.6", frac: "2/3" },
      { dec: "0.1", frac: "1/9" },
      { dec: "0.2", frac: "2/9" },
      { dec: "0.7", frac: "7/9" },
    ] as const;
    for (let k = 0; k < 14; k++) {
      const item = choice(rng, reps);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A repeating decimal is written as **${item.dec}̅** (the digit repeats). Convert it to a fraction.`,
          item.frac,
          `${item.dec}̅ is a common repeating decimal. Its fraction form is **${item.frac}**.`,
          undefined,
          "fraction"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n5-mixed") {
    for (let k = 0; k < 12; k++) {
      const d = choice(rng, [2, 4, 5, 8, 10] as const);
      const n = rint(rng, 1, d - 1);
      const dec = roundTo(n / d, 3);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Does the fraction **${n}/${d}** give a terminating decimal? (yes/no)`,
          [2, 4, 5, 8, 10].includes(d) ? "yes" : "no",
          `A fraction terminates if the denominator has only factors 2 and/or 5 (after simplifying). Here the denominator is ${d}, so the answer is **${[2,4,5,8,10].includes(d) ? "yes" : "no"}**.`,
          undefined,
          "yes/no"
        )
      );
      out.push(
        qAuto(
          lessonId,
          i++,
          `Convert **${n}/${d}** to a decimal.`,
          String(dec),
          `Divide: ${n} ÷ ${d} = **${dec}**.`,
          undefined,
          "decimal"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Number — N6: Add/subtract fractions & mixed numbers
// ----------------
function bankFracAddSub(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  if (lessonId === "g7-n6-like") {
    for (let k = 0; k < 14; k++) {
      const d = choice(rng, [4, 5, 6, 8, 10, 12] as const);
      const a = rint(rng, 1, d - 1);
      const b = rint(rng, 1, d - 1);
      const num = a + b;
      const [sn, sd] = simp(num, d);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Add: **${a}/${d} + ${b}/${d}** (simplify)`,
          `${sn}/${sd}`,
          `Same denominator: add numerators → (${a}+${b})/${d} = ${num}/${d}. Simplify to **${sn}/${sd}**.`,
          undefined,
          "fraction"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n6-unlike") {
    for (let k = 0; k < 14; k++) {
      const d1 = choice(rng, [3, 4, 5, 6, 8, 10] as const);
      const d2 = choice(rng, [4, 5, 6, 8, 10, 12] as const);
      const a = rint(rng, 1, d1 - 1);
      const b = rint(rng, 1, d2 - 1);
      const lcm = (d1 * d2) / gcd(d1, d2);
      const n1 = a * (lcm / d1);
      const n2 = b * (lcm / d2);
      const num = n1 + n2;
      const [sn, sd] = simp(num, lcm);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Add: **${a}/${d1} + ${b}/${d2}** (simplify)`,
          `${sn}/${sd}`,
          `Common denominator: LCM(${d1},${d2}) = ${lcm}. Convert and add: ${n1}/${lcm} + ${n2}/${lcm} = ${num}/${lcm}. Simplify to **${sn}/${sd}**.`,
          undefined,
          "fraction"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n6-regroup") {
    for (let k = 0; k < 12; k++) {
      const d = choice(rng, [4, 5, 6, 8, 10, 12] as const);
      const whole = rint(rng, 1, 6);
      const a = rint(rng, 1, d - 1);
      const b = rint(rng, a + 1, d - 1);
      // (whole + a/d) - (b/d) forces regrouping if a<b
      const num = whole * d + a - b;
      const [sn, sd] = simp(num, d);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Compute: **${whole} ${a}/${d} − ${b}/${d}** (simplify)`,
          `${sn}/${sd}`,
          `Rewrite ${whole} ${a}/${d} as an improper fraction: ${(whole * d + a)}/${d}. Subtract: (${whole * d + a}−${b})/${d} = ${num}/${d}. Simplify to **${sn}/${sd}**.`,
          undefined,
          "fraction"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n6-simplify") {
    for (let k = 0; k < 14; k++) {
      const d = choice(rng, [12, 14, 15, 16, 18, 20] as const);
      const n = rint(rng, 2, d - 2);
      const g = gcd(n, d);
      if (g == 1) continue;
      const [sn, sd] = simp(n, d);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Simplify the fraction **${n}/${d}**.`,
          `${sn}/${sd}`,
          `Divide numerator and denominator by their GCD (${g}). ${n}/${d} = **${sn}/${sd}**.`,
          undefined,
          "fraction"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n6-word") {
    for (let k = 0; k < 10; k++) {
      const d = choice(rng, [4, 5, 6, 8, 10, 12] as const);
      const eaten = rint(rng, 1, d - 1);
      const left = d - eaten;
      const [sn, sd] = simp(left, d);
      out.push(
        qAuto(
          lessonId,
          i++,
          `You eat **${eaten}/${d}** of a pizza. What fraction is left? (simplify)`,
          `${sn}/${sd}`,
          `Left = 1 − ${eaten}/${d} = ${d}/${d} − ${eaten}/${d} = ${left}/${d}. Simplify to **${sn}/${sd}**.`,
          undefined,
          "fraction"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Number — N7: Integers + comparing rational numbers
// ----------------
function bankIntegers(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  if (lessonId === "g7-n7-intro") {
    for (let k = 0; k < 12; k++) {
      const temp = rint(rng, -25, 25);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A temperature is **${temp}°C**. Is this above 0°C? (yes/no)`,
          temp > 0 ? "yes" : "no",
          `${temp} is ${temp > 0 ? "positive" : temp == 0 ? "zero" : "negative"}. Above 0°C means positive, so the answer is **${temp > 0 ? "yes" : "no"}**.`,
          undefined,
          "yes/no"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n7-add") {
    for (let k = 0; k < 14; k++) {
      const a = rint(rng, -15, 15);
      const b = rint(rng, -15, 15);
      const ans = a + b;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Compute: **${a} + (${b})**`,
          String(ans),
          `Add the integers: ${a}+${b} = **${ans}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n7-sub") {
    for (let k = 0; k < 14; k++) {
      const a = rint(rng, -15, 15);
      const b = rint(rng, -15, 15);
      const ans = a - b;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Compute: **${a} − (${b})**`,
          String(ans),
          `Subtracting is adding the opposite: ${a} − (${b}) = ${a} + ${-b} = **${ans}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n7-tiles") {
    for (let k = 0; k < 12; k++) {
      const pos = rint(rng, 1, 10);
      const neg = rint(rng, 1, 10);
      const ans = pos - neg;
      out.push(
        qAuto(
          lessonId,
          i++,
          `You have **${pos}** positive tiles and **${neg}** negative tiles. After making zero pairs, what is the value?`,
          String(ans),
          `Each + and − pair makes 0. Leftover value is ${pos} − ${neg} = **${ans}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n7-compare") {
    for (let k = 0; k < 14; k++) {
      const a = roundTo(rint(rng, -20, 20) / 10, 1);
      const b = roundTo(rint(rng, -20, 20) / 10, 1);
      const ans = a > b ? ">" : a < b ? "<" : "=";
      out.push(
        qAuto(
          lessonId,
          i++,
          `Compare: **${a} __ ${b}**. Type **>**, **<**, or **=**.`,
          ans,
          `On a number line, ${a} is ${ans === ">" ? "to the right of" : ans === "<" ? "to the left of" : "the same as"} ${b}, so the symbol is **${ans}**.`,
          undefined,
          "> < ="
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-n7-order") {
    for (let k = 0; k < 12; k++) {
      const nums = [roundTo(rint(rng, -40, 40) / 10, 1), roundTo(rint(rng, -40, 40) / 10, 1), roundTo(rint(rng, -40, 40) / 10, 1), roundTo(rint(rng, -40, 40) / 10, 1)];
      const sorted = [...nums].sort((x, y) => x - y);
      const ans = sorted.join(",");
      out.push(
        qAuto(
          lessonId,
          i++,
          `Order from least to greatest: **${nums.join(", ")}** (comma-separated)`,
          ans,
          `Least to greatest means increasing on the number line. Sorted order: **${sorted.join(", ")}**.`,
          [sorted.slice().sort((x, y) => x - y).join(",")],
          "a,b,c,d"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Patterns and Relations — PR1: Linear patterns
// ----------------
function bankLinearPatterns(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  if (lessonId === "g7-pr1-spot") {
    for (let k = 0; k < 12; k++) {
      const start = rint(rng, -5, 10);
      const step = choice(rng, [2, 3, 4, 5, -2, -3] as const);
      const seq = [start, start + step, start + 2 * step, start + 3 * step];
      out.push(
        qAuto(
          lessonId,
          i++,
          `Sequence: **${seq.join(", ")}**. What is the common difference?`,
          String(step),
          `Subtract consecutive terms: ${seq[1]}−${seq[0]} = ${step}. So the common difference is **${step}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-pr1-write") {
    for (let k = 0; k < 12; k++) {
      const m = choice(rng, [2, 3, 4, 5, -2, -3] as const);
      const b = rint(rng, -5, 8);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A linear relation is **y = ${m}x + ${b}**. What is y when x = 4?`,
          String(m * 4 + b),
          `Substitute x = 4: y = ${m}×4 + ${b} = **${m * 4 + b}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-pr1-table") {
    for (let k = 0; k < 12; k++) {
      const m = choice(rng, [2, 3, 4, -2, -3] as const);
      const b = rint(rng, -3, 6);
      const x = rint(rng, 0, 6);
      const y = m * x + b;
      out.push(
        qAuto(
          lessonId,
          i++,
          `For **y = ${m}x + ${b}**, find y when x = **${x}**.`,
          String(y),
          `Compute y = ${m}×${x} + ${b} = **${y}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-pr1-graph") {
    for (let k = 0; k < 12; k++) {
      const m = choice(rng, [1, 2, 3, -1, -2] as const);
      const b = rint(rng, -4, 6);
      const x = rint(rng, -3, 3);
      const y = m * x + b;
      out.push(
        qAuto(
          lessonId,
          i++,
          `A point on the line **y = ${m}x + ${b}** has x = **${x}**. What is y?`,
          String(y),
          `Substitute x = ${x}: y = ${m}×${x} + ${b} = **${y}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-pr1-what-if") {
    for (let k = 0; k < 10; k++) {
      const m = choice(rng, [2, 3, 4] as const);
      const b = rint(rng, 0, 6);
      const y = rint(rng, 10, 40);
      const x = (y - b) / m;
      if (x % 1 !== 0) continue;
      out.push(
        qAuto(
          lessonId,
          i++,
          `For **y = ${m}x + ${b}**, what x gives y = **${y}**?`,
          String(x),
          `Solve: ${y} = ${m}x + ${b} → ${m}x = ${y - b} → x = ${y - b}/${m} = **${x}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Patterns and Relations — PR2: Expressions & equations
// ----------------
function bankExpressions(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  if (lessonId === "g7-pr2-vs") {
    out.push(qAuto(lessonId, i++, "An equation has an equals sign (=). (yes/no)", "yes", "An equation states two expressions are equal, so it uses =.", undefined, "yes/no"));
    out.push(qAuto(lessonId, i++, "Is **3x + 2** an expression (no equals sign)? (yes/no)", "yes", "It has no equals sign, so it’s an expression.", undefined, "yes/no"));
    while (out.length < 12) {
      const hasEq = rng() > 0.5;
      const prompt = hasEq ? "Is **2x + 5 = 11** an equation? (yes/no)" : "Is **7y − 3** an equation? (yes/no)";
      const ans = hasEq ? "yes" : "no";
      out.push(qAuto(lessonId, i++, prompt, ans, hasEq ? "It has an equals sign, so it’s an equation." : "No equals sign, so it’s not an equation.", undefined, "yes/no"));
    }
    return out;
  }

  if (lessonId === "g7-pr2-parts") {
    for (let k = 0; k < 12; k++) {
      const coeff = rint(rng, 2, 9);
      const constTerm = rint(rng, -6, 10);
      out.push(
        qAuto(
          lessonId,
          i++,
          `In the expression **${coeff}x ${constTerm >= 0 ? "+" : "-"} ${Math.abs(constTerm)}**, what is the coefficient of x?`,
          String(coeff),
          `The coefficient is the number multiplying x. Here, it is **${coeff}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-pr2-equality") {
    for (let k = 0; k < 12; k++) {
      const a = rint(rng, 4, 20);
      const b = rint(rng, 1, 10);
      out.push(
        qAuto(
          lessonId,
          i++,
          `If **${a} = ${a}**, what is **${a} + ${b}** on the left AND right? (answer just the number)`,
          String(a + b),
          `To keep equality, do the same to both sides: ${a}+${b} = **${a + b}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-pr2-substitute") {
    for (let k = 0; k < 14; k++) {
      const a = rint(rng, -6, 8);
      const m = rint(rng, 2, 6);
      const b = rint(rng, -5, 9);
      const val = m * a + b;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Evaluate **${m}x ${b >= 0 ? "+" : "-"} ${Math.abs(b)}** when x = **${a}**.`,
          String(val),
          `Substitute x=${a}: ${m}×${a} ${b >= 0 ? "+" : "-"} ${Math.abs(b)} = **${val}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-pr2-one-step") {
    for (let k = 0; k < 14; k++) {
      const x = rint(rng, -10, 10);
      const a = rint(rng, -10, 10);
      const b = x + a;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Solve for x: **x ${a >= 0 ? "+" : "-"} ${Math.abs(a)} = ${b}**`,
          String(x),
          `Undo adding/subtracting ${a}. x = ${b} ${a >= 0 ? "−" : "+"} ${Math.abs(a)} = **${x}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-pr2-check") {
    for (let k = 0; k < 12; k++) {
      const x = rint(rng, -8, 8);
      const a = rint(rng, 2, 6);
      const b = a * x;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Check if x = **${x}** solves **${a}x = ${b}**. (yes/no)`,
          "yes",
          `Substitute x=${x}: ${a}×${x} = ${b}. The statement is true, so **yes**.`,
          undefined,
          "yes/no"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Statistics and Probability — SP1: Data analysis
// ----------------
function mean(nums: number[]) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function median(nums: number[]) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

function mode(nums: number[]) {
  const m = new Map<number, number>();
  for (const x of nums) m.set(x, (m.get(x) || 0) + 1);
  let best = nums[0]!;
  let bestCount = 0;
  for (const [k, c] of m.entries()) {
    if (c > bestCount) {
      best = k;
      bestCount = c;
    }
  }
  return best;
}

function bankDataAnalysis(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  if (lessonId === "g7-sp1-mmmr") {
    for (let k = 0; k < 12; k++) {
      const list = Array.from({ length: 5 }, () => rint(rng, 2, 12));
      const ans = roundTo(mean(list), 2);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Data: **${list.join(", ")}**. What is the mean? (round to 2 decimals)`,
          ans.toString(),
          `Mean = sum ÷ count. Sum = ${list.reduce((a, b) => a + b, 0)} and count = 5. Mean = **${ans}**.`,
          undefined,
          "number"
        )
      );
      out.push(
        qAuto(
          lessonId,
          i++,
          `Data: **${list.join(", ")}**. What is the range?`,
          String(Math.max(...list) - Math.min(...list)),
          `Range = max − min = ${Math.max(...list)} − ${Math.min(...list)} = **${Math.max(...list) - Math.min(...list)}**.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-sp1-best") {
    out.push(qAuto(lessonId, i++, "If data has an extreme outlier, which is usually better: mean or median? (type mean/median)", "median", "Median is less affected by outliers than the mean.", ["themedian"], "mean/median"));
    out.push(qAuto(lessonId, i++, "If all values are close together with no outliers, which is fine to use: mean or median? (type one)", "mean", "When there are no extreme outliers, the mean is a good average.", ["themean"], "mean/median"));
    while (out.length < 12) {
      const hasOutlier = rng() > 0.5;
      out.push(
        qAuto(
          lessonId,
          i++,
          `Scenario: ${hasOutlier ? "one value is extremely different" : "values are fairly balanced"}. Best measure: mean or median?`,
          hasOutlier ? "median" : "mean",
          hasOutlier ? "Outliers pull the mean, so median is better." : "With balanced data, mean works well.",
          undefined,
          "mean/median"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-sp1-outliers") {
    for (let k = 0; k < 10; k++) {
      const list = [3, 4, 4, 5, 6];
      const outlier = choice(rng, [25, 30, 40] as const);
      const withOutlier = [...list, outlier];
      const m1 = roundTo(mean(list), 2);
      const m2 = roundTo(mean(withOutlier), 2);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Original data: **${list.join(", ")}** has mean ${m1}. If you add outlier **${outlier}**, does the mean go up or down? (up/down)`,
          "up",
          `An outlier like ${outlier} is much larger, so it increases the mean: ${m2} > ${m1}.`,
          undefined,
          "up/down"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-sp1-circle") {
    for (let k = 0; k < 12; k++) {
      const pct = choice(rng, [10, 15, 20, 25, 30, 40] as const);
      const deg = (pct / 100) * 360;
      out.push(
        qAuto(
          lessonId,
          i++,
          `A slice is **${pct}%** of a circle graph. What angle does it have?`,
          String(deg),
          `Circle graphs total 360°. ${pct}% of 360° = (${pct}/100)×360 = **${deg}°**.`,
          undefined,
          "degrees"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-sp1-build") {
    for (let k = 0; k < 10; k++) {
      const total = choice(rng, [20, 25, 30, 40] as const);
      const part = rint(rng, 4, total - 4);
      const pct = roundTo((part / total) * 100, 1);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A survey has **${total}** students. **${part}** choose apples. What percent chose apples? (1 decimal)`,
          pct.toFixed(1),
          `Percent = (part/total)×100 = (${part}/${total})×100 = **${pct.toFixed(1)}%**.`,
          [String(pct)],
          "1 decimal"
        )
      );
    }
    return out;
  }

  return [];
}

// ----------------
// Statistics and Probability — SP2: Chance & uncertainty
// ----------------
function bankProbability(lessonId: string): Question[] {
  const rng = makeRng(lessonId);
  const out: Question[] = [];
  let i = 0;

  if (lessonId === "g7-sp2-ratio") {
    for (let k = 0; k < 12; k++) {
      const total = rint(rng, 8, 20);
      const fav = rint(rng, 1, total - 1);
      const [sn, sd] = simp(fav, total);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A bag has **${fav}** red marbles and **${total - fav}** blue marbles. What is P(red) as a fraction (simplify)?`,
          `${sn}/${sd}`,
          `Probability = favorable/total = ${fav}/${total}. Simplify to **${sn}/${sd}**.`,
          undefined,
          "fraction"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-sp2-scale") {
    out.push(qAuto(lessonId, i++, "If an event has probability 0, it is (impossible/certain).", "impossible", "Probability 0 means it cannot happen.", undefined, "word"));
    out.push(qAuto(lessonId, i++, "If an event has probability 1, it is (impossible/certain).", "certain", "Probability 1 means it will happen.", undefined, "word"));
    while (out.length < 12) {
      const p = choice(rng, [0, 0.25, 0.5, 0.75, 1] as const);
      const label = p === 0 ? "impossible" : p === 1 ? "certain" : p < 0.5 ? "unlikely" : p === 0.5 ? "equally likely" : "likely";
      out.push(
        qAuto(
          lessonId,
          i++,
          `An event has probability **${p}**. Is it more like impossible, unlikely, equally likely, likely, or certain? (type one word)`,
          label,
          `On the 0–1 scale, ${p} is closest to **${label}**.`,
          undefined,
          "one word"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-sp2-sample") {
    // Two independent events: coin + die; ask for number of outcomes
    out.push(
      qAuto(
        lessonId,
        i++,
        "A coin (H/T) and a 6-sided die are used. How many outcomes are in the sample space?",
        "12",
        "Coin has 2 outcomes and die has 6, so total outcomes = 2×6 = **12**.",
        undefined,
        "number"
      )
    );
    while (out.length < 12) {
      const a = choice(rng, [2, 3, 4] as const);
      const b = choice(rng, [4, 6, 8] as const);
      out.push(
        qAuto(
          lessonId,
          i++,
          `Spinner A has **${a}** equal sections. Spinner B has **${b}** equal sections. How many outcomes are in the sample space when you spin both?`,
          String(a * b),
          `Independent events multiply: ${a}×${b} = **${a * b}** outcomes.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-sp2-theoretical") {
    for (let k = 0; k < 12; k++) {
      const reds = rint(rng, 1, 6);
      const blues = rint(rng, 1, 6);
      const total = reds + blues;
      const [sn, sd] = simp(reds, total);
      out.push(
        qAuto(
          lessonId,
          i++,
          `A bag has **${reds}** red and **${blues}** blue marbles. What is the theoretical probability of red? (simplify)`,
          `${sn}/${sd}`,
          `Theoretical P(red) = ${reds}/${total}. Simplify to **${sn}/${sd}**.`,
          undefined,
          "fraction"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-sp2-exp") {
    for (let k = 0; k < 10; k++) {
      const trials = choice(rng, [10, 20, 30, 40] as const);
      const success = rint(rng, 1, trials - 1);
      const exp = roundTo(success / trials, 2);
      out.push(
        qAuto(
          lessonId,
          i++,
          `In **${trials}** trials, an event happened **${success}** times. What is the experimental probability? (2 decimals)`,
          exp.toFixed(2),
          `Experimental probability = successes ÷ trials = ${success}/${trials} = **${exp.toFixed(2)}**.`,
          [String(exp)],
          "0.00"
        )
      );
    }
    return out;
  }

  if (lessonId === "g7-sp2-run") {
    out.push(
      qAuto(
        lessonId,
        i++,
        "If experimental probability is far from theoretical, what usually helps: more trials or fewer trials?",
        "more",
        "More trials generally make experimental results closer to the theoretical probability.",
        ["moretrials"],
        "more/fewer"
      )
    );
    while (out.length < 12) {
      const trials = choice(rng, [10, 20, 50, 100] as const);
      out.push(
        qAuto(
          lessonId,
          i++,
          `You flip a fair coin. If you want results closer to 50% heads, should you do **${trials}** flips or **${trials * 4}** flips? (type ${trials} or ${trials * 4})`,
          String(trials * 4),
          `More trials reduces randomness. **${trials * 4}** flips is better.`,
          undefined,
          "number"
        )
      );
    }
    return out;
  }

  return [];
}
