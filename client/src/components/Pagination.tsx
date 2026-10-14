import type { PageMeta } from "../api/appointments";
import { Button } from "./Button";

type Props = { meta: PageMeta; onPage: (page: number) => void };

export function Pagination({ meta, onPage }: Props) {
  if (meta.total === 0) return null;
  const first = (meta.page - 1) * meta.limit + 1;
  const last = Math.min(meta.page * meta.limit, meta.total);

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 text-sm text-gray-600">
      <p>
        {first}–{last} of {meta.total}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="secondary" disabled={meta.page <= 1} onClick={() => onPage(meta.page - 1)}>
          Previous
        </Button>
        <span>
          Page {meta.page} of {meta.totalPages}
        </span>
        <Button variant="secondary" disabled={meta.page >= meta.totalPages} onClick={() => onPage(meta.page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
