export type Lesson = {
  id: string;
  title: string;
  url: string;
  tags: string[];
  difficulty?: "elementary" | "middle" | "high" | "university";
};

/**
 * Lesson catalogue used by the AI Tutor to recommend videos.
 *
 * Start by listing lessons here (or load them from Firestore). Later, you can
 * replace `searchLessons` with embeddings + vector search.
 */
export const LESSONS: Lesson[] = [];

function normalize(s: string) {
  return s.toLowerCase();
}

/**
 * Naive keyword-based search.
 *
 * It scores lessons based on overlapping words in (query + tags) against the lesson
 * title/tags, then returns the top results.
 */
export function searchLessons(params: {
  query: string;
  tags?: string[];
  limit?: number;
}) {
  const limit = Math.max(0, Math.min(10, params.limit ?? 3));
  if (limit === 0) return [] as Lesson[];

  const q = normalize(params.query || "");
  const extra = (params.tags || []).map(normalize).join(" ");
  const hayNeedle = `${q} ${extra}`.trim();
  if (!hayNeedle) return [];

  const needles = hayNeedle
    .split(/\s+/g)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3);

  const scored = LESSONS.map((l) => {
    const hay = normalize(`${l.title} ${l.tags.join(" ")}`);
    let score = 0;
    for (const w of needles) {
      if (hay.includes(w)) score += 1;
    }
    return { l, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.l);

  return scored;
}
