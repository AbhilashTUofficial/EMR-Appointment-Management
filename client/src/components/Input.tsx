import { useId, type ComponentProps } from "react";
import { Field, controlClass } from "./Field";

type Props = ComponentProps<"input"> & { label: string; error?: string };

// className styles the wrapper, not the input itself.
export function Input({ label, error, id, className, ...props }: Props) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <Field id={inputId} label={label} error={error} className={className}>
      <input
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={controlClass}
        {...props}
      />
    </Field>
  );
}
