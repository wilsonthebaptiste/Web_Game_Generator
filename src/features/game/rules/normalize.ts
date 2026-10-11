/**
 * Word-guessing normalization (spec §6, plan.md §1.5): trim leading/trailing whitespace and
 * ignore case. Deliberately no fuzzy matching. The SQL `reveal_round` must use the same rule
 * (`lower(btrim(text))`).
 */
export function normalizeAnswer(text: string): string {
  return text.trim().toLowerCase()
}
