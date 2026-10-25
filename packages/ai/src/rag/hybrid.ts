// Truy hồi lai (tech design §7): cosine trong Node + Reciprocal Rank Fusion. Hàm thuần.

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! ** 2;
    normB += b[index]! ** 2;
  }
  return normA === 0 || normB === 0 ? 0 : dot / Math.sqrt(normA * normB);
}

export function topByCosine(query: number[], items: Array<{ id: string; vector: number[] }>, k: number): string[] {
  return items
    .map((item) => ({ id: item.id, score: cosine(query, item.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((item) => item.id);
}

/** Điểm Σ 1/(k + rank), rank từ 1; hòa điểm giữ thứ tự xuất hiện đầu tiên. */
export function rrf(rankings: string[][], k = 60, limit = 6): string[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (k + index + 1)));
  }
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);
}
