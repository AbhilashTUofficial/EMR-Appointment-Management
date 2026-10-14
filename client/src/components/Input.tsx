import { useId, type ComponentProps } from "react";

type Props = ComponentProps<"input"> & { label: string; error?: string };

// className styles the wrapper, not the input itself.
export function Input({ label, error, id, className = "", ...props }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        className="block w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none aria-invalid:border-red-500 sm:text-sm"
        {...props}
      />
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
