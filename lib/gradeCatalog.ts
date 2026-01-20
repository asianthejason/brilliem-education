export type Tier = "none" | "free" | "lessons" | "lessons_ai";

export type LessonRef = {
  id: string;
  title: string;
  // Optional short note (used for tooltips / coming-soon messaging)
  note?: string;
};

export type UnitRef = {
  id: string;
  strand: string;
  title: string;
  lessons: LessonRef[];
};

export type GradeRef = {
  grade: number;
  label: string;
  units: UnitRef[];
};

// Grade 7 unit checklist, sourced from the user-provided document.
// (Strands + unit titles + lesson bullets)
//
// Later: replace this file with curriculum data from your DB.
export const GRADE_7: GradeRef = {
  grade: 7,
  label: "Grade 7",
  units: [
    {
      id: "g7-n1",
      strand: "Number",
      title: "N1: Divisibility & factors",
      lessons: [
        { id: "g7-n1-div-2-5-10", title: "Divisible means + quick tests (2, 5, 10)" },
        { id: "g7-n1-div-3-9", title: "Divisibility by 3 and 9 (digit sums)" },
        { id: "g7-n1-div-4-8", title: "Divisibility by 4 and 8" },
        { id: "g7-n1-div-6", title: "Divisibility by 6 (2 & 3 together)" },
        { id: "g7-n1-factors-fast", title: "Finding factors fast using divisibility rules" },
        { id: "g7-n1-factor-trees", title: "Factor trees + prime factorization (intro)" },
        { id: "g7-n1-sort-venn", title: "Sorting numbers with Venn/Carroll diagrams" },
      ],
    },
    {
      id: "g7-n2",
      strand: "Number",
      title: "N2: Decimal operations",
      lessons: [
        { id: "g7-n2-estimation", title: "Estimation & placing the decimal (reasonableness)", note: "Practice bank coming soon" },
        { id: "g7-n2-add-sub", title: "Adding/subtracting decimals (align place value)", note: "Practice bank coming soon" },
        { id: "g7-n2-multiply", title: "Multiplying decimals (place-value logic)", note: "Practice bank coming soon" },
        { id: "g7-n2-divide", title: "Dividing decimals (why we “shift” decimals)", note: "Practice bank coming soon" },
        { id: "g7-n2-word-problems", title: "Word problems: money/measurement decimals", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-n3",
      strand: "Number",
      title: "N3: Percent",
      lessons: [
        { id: "g7-n3-benchmarks", title: "Percent as “per 100” + benchmark percents", note: "Practice bank coming soon" },
        { id: "g7-n3-conversions", title: "Percent ↔ fraction ↔ decimal conversions", note: "Practice bank coming soon" },
        { id: "g7-n3-percent-of", title: "Find a percent of a quantity", note: "Practice bank coming soon" },
        { id: "g7-n3-inc-dec", title: "Percent increase/decrease (discount/tax/tips)", note: "Practice bank coming soon" },
        { id: "g7-n3-multi-step", title: "Multi-step percent word problems", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-n4",
      strand: "Number",
      title: "N4: Order of operations (BEDMAS)",
      lessons: [
        { id: "g7-n4-why", title: "Why order matters (counterexamples)", note: "Practice bank coming soon" },
        { id: "g7-n4-exponents", title: "Exponents basics + common traps", note: "Practice bank coming soon" },
        { id: "g7-n4-no-brackets", title: "BEDMAS with integers/decimals (no brackets)", note: "Practice bank coming soon" },
        { id: "g7-n4-brackets", title: "BEDMAS with brackets (nested parentheses)", note: "Practice bank coming soon" },
        { id: "g7-n4-context", title: "Real context problems (multi-operation)", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-n5",
      strand: "Number",
      title: "N5: Fractions ↔ decimals",
      lessons: [
        { id: "g7-n5-term-to-frac", title: "Terminating decimals → fractions", note: "Practice bank coming soon" },
        { id: "g7-n5-frac-to-dec", title: "Fractions → decimals (when it terminates)", note: "Practice bank coming soon" },
        { id: "g7-n5-repeat", title: "Repeating decimals as fractions", note: "Practice bank coming soon" },
        { id: "g7-n5-mixed", title: "Mixed practice + tell terminating vs repeating", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-n6",
      strand: "Number",
      title: "N6: Add/subtract fractions & mixed numbers",
      lessons: [
        { id: "g7-n6-like", title: "Like denominators (fractions & mixed numbers)", note: "Practice bank coming soon" },
        { id: "g7-n6-unlike", title: "Unlike denominators: common denominators", note: "Practice bank coming soon" },
        { id: "g7-n6-regroup", title: "Mixed numbers: regrouping/borrowing", note: "Practice bank coming soon" },
        { id: "g7-n6-simplify", title: "Simplifying answers + when to do it", note: "Practice bank coming soon" },
        { id: "g7-n6-word", title: "Word problems with fraction +/−", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-n7",
      strand: "Number",
      title: "N7: Integers + comparing rational numbers",
      lessons: [
        { id: "g7-n7-intro", title: "Integers in real life (temperature/elevation/money)", note: "Practice bank coming soon" },
        { id: "g7-n7-add", title: "Adding integers with a number line", note: "Practice bank coming soon" },
        { id: "g7-n7-sub", title: "Subtracting integers with a number line", note: "Practice bank coming soon" },
        { id: "g7-n7-tiles", title: "Integer tiles model (opposites make zero)", note: "Practice bank coming soon" },
        { id: "g7-n7-compare", title: "Comparing rational numbers with benchmarks", note: "Practice bank coming soon" },
        { id: "g7-n7-order", title: "Ordering mixed sets (fractions/decimals/wholes)", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-pr1",
      strand: "Patterns and Relations",
      title: "PR1: Linear patterns & relations",
      lessons: [
        { id: "g7-pr1-spot", title: "Spotting pattern rules in words & visuals", note: "Practice bank coming soon" },
        { id: "g7-pr1-write", title: "Writing a linear relation for a pattern", note: "Practice bank coming soon" },
        { id: "g7-pr1-table", title: "Tables of values from a linear relation", note: "Practice bank coming soon" },
        { id: "g7-pr1-graph", title: "Graphing the table (discrete points)", note: "Practice bank coming soon" },
        { id: "g7-pr1-what-if", title: "Using graphs to solve “what if” questions", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-pr2",
      strand: "Patterns and Relations",
      title: "PR2: Expressions, equations, and equality",
      lessons: [
        { id: "g7-pr2-vs", title: "Expression vs equation (what “=” claims)", note: "Practice bank coming soon" },
        { id: "g7-pr2-parts", title: "Parts of an expression (variable/coefficient/etc.)", note: "Practice bank coming soon" },
        { id: "g7-pr2-equality", title: "Preservation of equality (do same to both sides)", note: "Practice bank coming soon" },
        { id: "g7-pr2-substitute", title: "Evaluate expressions by substitution", note: "Practice bank coming soon" },
        { id: "g7-pr2-one-step", title: "One-step equations x + a = b (integers)", note: "Practice bank coming soon" },
        { id: "g7-pr2-check", title: "Checking solutions by substitution", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-ss1",
      strand: "Shape and Space",
      title: "SS1: Circles",
      lessons: [
        { id: "g7-ss1-rel", title: "Radius/diameter/circumference relationships", note: "Practice bank coming soon" },
        { id: "g7-ss1-pi", title: "What π means (C ÷ d)", note: "Practice bank coming soon" },
        { id: "g7-ss1-formula", title: "Circumference formula + solve for r or d", note: "Practice bank coming soon" },
        { id: "g7-ss1-angles", title: "Central angles add to 360°", note: "Practice bank coming soon" },
        { id: "g7-ss1-construct", title: "Constructing circles (given r or d)", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-ss2",
      strand: "Shape and Space",
      title: "SS2: Area formulas",
      lessons: [
        { id: "g7-ss2-tri", title: "Triangle area from rectangle idea (½bh)", note: "Practice bank coming soon" },
        { id: "g7-ss2-par", title: "Parallelogram area (base×height)", note: "Practice bank coming soon" },
        { id: "g7-ss2-circle", title: "Circle area (why it’s πr²)", note: "Practice bank coming soon" },
        { id: "g7-ss2-composite", title: "Mixed area word problems (composite shapes)", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-ss3",
      strand: "Shape and Space",
      title: "SS3: Geometric constructions",
      lessons: [
        { id: "g7-ss3-pbis", title: "Perpendicular bisector (steps + why)", note: "Practice bank coming soon" },
        { id: "g7-ss3-abis", title: "Angle bisector (steps + verify)", note: "Practice bank coming soon" },
        { id: "g7-ss3-perp", title: "Construct perpendicular through a point", note: "Practice bank coming soon" },
        { id: "g7-ss3-parallel", title: "Construct parallel lines", note: "Practice bank coming soon" },
        { id: "g7-ss3-challenge", title: "Construction challenge mini problems", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-ss4",
      strand: "Shape and Space",
      title: "SS4: Cartesian plane & transformations",
      lessons: [
        { id: "g7-ss4-plot", title: "Plotting points in 4 quadrants", note: "Practice bank coming soon" },
        { id: "g7-ss4-shapes", title: "Drawing shapes from coordinates", note: "Practice bank coming soon" },
        { id: "g7-ss4-translate", title: "Translations: slide rules + new coordinates", note: "Practice bank coming soon" },
        { id: "g7-ss4-reflect", title: "Reflections (x-axis / y-axis)", note: "Practice bank coming soon" },
        { id: "g7-ss4-rotate", title: "Rotations (90°, 180°) with integer vertices", note: "Practice bank coming soon" },
        { id: "g7-ss4-multi", title: "Multi-step transformations", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-sp1",
      strand: "Statistics and Probability",
      title: "SP1: Data analysis",
      lessons: [
        { id: "g7-sp1-mmmr", title: "Mean/median/mode/range — what each means", note: "Practice bank coming soon" },
        { id: "g7-sp1-best", title: "Choose the best measure for a context", note: "Practice bank coming soon" },
        { id: "g7-sp1-outliers", title: "Outliers: effect on mean/median/mode", note: "Practice bank coming soon" },
        { id: "g7-sp1-circle", title: "Circle graphs: parts add to 100% / 360°", note: "Practice bank coming soon" },
        { id: "g7-sp1-build", title: "Build a circle graph + interpret questions", note: "Practice bank coming soon" },
      ],
    },
    {
      id: "g7-sp2",
      strand: "Statistics and Probability",
      title: "SP2: Chance & uncertainty",
      lessons: [
        { id: "g7-sp2-ratio", title: "Probability as ratio, fraction, percent", note: "Practice bank coming soon" },
        { id: "g7-sp2-scale", title: "Impossible to certain scale", note: "Practice bank coming soon" },
        { id: "g7-sp2-sample", title: "Sample space for two independent events", note: "Practice bank coming soon" },
        { id: "g7-sp2-theoretical", title: "Theoretical probability for 2-event experiments", note: "Practice bank coming soon" },
        { id: "g7-sp2-exp", title: "Experimental vs theoretical probability", note: "Practice bank coming soon" },
        { id: "g7-sp2-run", title: "Run an experiment + compare", note: "Practice bank coming soon" },
      ],
    },
  ],
};

export const GRADES_7_TO_12: GradeRef[] = [
  GRADE_7,
  { grade: 8, label: "Grade 8", units: [] },
  { grade: 9, label: "Grade 9", units: [] },
  { grade: 10, label: "Grade 10", units: [] },
  { grade: 11, label: "Grade 11", units: [] },
  { grade: 12, label: "Grade 12", units: [] },
];

export function isLessonUnlocked(params: {
  tier: Tier;
  unit: UnitRef;
  lessonIndex: number;
}) {
  if (params.tier === "free") {
    // Free tier: first lesson of each unit.
    return params.lessonIndex === 0;
  }
  return params.tier !== "none";
}
