/**
 * Whether a caller-supplied value may stand as ONE path segment of a backend
 * URL once `encodeURIComponent` has escaped it.
 *
 * Escaping handles `/`, `?` and `#`, but leaves `.` and `..` as they are, and a
 * URL resolver then treats them as dot segments: `/me/providers/../disconnect`
 * becomes `/me/disconnect`. Refused rather than escaped differently, since no
 * real name is either (review of v0.2.0-rc fixes). An empty value would address
 * the collection instead of an item.
 */
export function isSafePathSegment(value: string): boolean {
  return value !== "" && value !== "." && value !== "..";
}
