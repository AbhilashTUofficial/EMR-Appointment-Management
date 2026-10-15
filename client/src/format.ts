// "2026-10-19" as "Mon, Oct 19, 2026". Read as a local date so the browser's timezone can't shift the day.
export const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });

// Today's date as YYYY-MM-DD in the browser's timezone. The server decides what counts as "today"
// for anything that matters; this only picks defaults and which buttons to offer.
export const today = () => new Date().toLocaleDateString("en-CA");

// Whole years since a date of birth ("1990-05-01" or a full ISO date), or undefined when it isn't known.
export function age(dateOfBirth?: string) {
  if (!dateOfBirth) return undefined;
  const born = new Date(dateOfBirth);
  const now = new Date();
  const birthdayPassed = now.getMonth() > born.getUTCMonth() || (now.getMonth() === born.getUTCMonth() && now.getDate() >= born.getUTCDate());
  return now.getFullYear() - born.getUTCFullYear() - (birthdayPassed ? 0 : 1);
}
