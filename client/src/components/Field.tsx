import type { ReactNode } from "react";

// Shared by Input and Select so every form control has the same label, error text and focus style.
export const controlClass =
  "block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none aria-invalid:border-red-500 sm:text-sm";

type Props = { id: string; label: string; error?: string; className?: string; children: ReactNode };

export function Field({ id, label, error, className = "", children }: Props) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
