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
      return [];
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
