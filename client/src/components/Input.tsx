import { useId, useState, type ComponentProps } from "react";
import { Field, controlClass } from "./Field";

type Props = ComponentProps<"input"> & { label: string; error?: string };

// className styles the wrapper, not the input itself.
// Password inputs get their own show/hide button; the browser's built-in one comes and goes (see index.css).
export function Input({ label, error, id, className, type, ...props }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";

  const input = (
    <input
      id={inputId}
      type={isPassword && revealed ? "text" : type}
      aria-invalid={!!error}
      aria-describedby={error ? `${inputId}-error` : undefined}
      className={isPassword ? `${controlClass} pr-16` : controlClass}
      {...props}
    />
  );

  return (
    <Field id={inputId} label={label} error={error} className={className}>
      {isPassword ? (
        <div className="relative">
          {input}
          <button
            type="button"
            aria-pressed={revealed}
            onClick={() => setRevealed((shown) => !shown)}
            className="absolute inset-y-0 right-0 px-3 text-sm text-blue-700 hover:underline"
          >
            {revealed ? "Hide" : "Show"}
          </button>
        </div>
      ) : (
        input
      )}
    </Field>
  );
}
