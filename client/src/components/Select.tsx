import { useId, type ComponentProps } from "react";
import { Field, controlClass } from "./Field";

type Props = ComponentProps<"select"> & { label: string; error?: string };

// className styles the wrapper, not the select itself.
export function Select({ label, error, id, className, children, ...props }: Props) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  return (
    <Field id={selectId} label={label} error={error} className={className}>
      <select
        id={selectId}
        aria-invalid={!!error}
        aria-describedby={error ? `${selectId}-error` : undefined}
        className={controlClass}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
}
