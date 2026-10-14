// "2026-10-19" as "Mon, Oct 19, 2026". Read as a local date so the browser's timezone can't shift the day.
export const formatDate = (date: string) =>
  new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
