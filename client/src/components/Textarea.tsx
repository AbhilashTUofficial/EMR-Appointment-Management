import { useId, type ComponentProps } from "react";
import { Field, controlClass } from "./Field";

type Props = ComponentProps<"textarea"> & { label: string; error?: string };

// className styles the wrapper, not the textarea itself.
export function Textarea({ label, error, id, className, ...props }: Props) {
  const generatedId = useId();
  const textareaId = id ?? generatedId;
  return (
    <Field id={textareaId} label={label} error={error} className={className}>
      <textarea
        id={textareaId}
        rows={3}
        aria-invalid={!!error}
        aria-describedby={error ? `${textareaId}-error` : undefined}
        className={controlClass}
        {...props}
      />
    </Field>
  );
}
