import * as React from "react";
import { cn } from "@/lib/utils";

const fieldClass =
  "touch-manipulation flex min-h-11 w-full rounded-md border border-input bg-panel-elevated px-3 py-2 text-base text-foreground transition-none file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/30 disabled:cursor-not-allowed disabled:opacity-50";

function blankNumeric(value: unknown): string {
  if (value == null || value === "" || value === 0 || value === "0") return "";
  return String(value);
}

const NumberInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<"input">, "type" | "placeholder">
>(({ className, value, defaultValue, onChange, ...props }, ref) => {
  const controlled = value !== undefined;
  const [text, setText] = React.useState(() =>
    blankNumeric(controlled ? value : defaultValue),
  );
  const [prev, setPrev] = React.useState(value);
  if (controlled && value !== prev) {
    setPrev(value);
    const parsed = Number(String(text).replace(/\s/g, "").replace(",", "."));
    const incoming = typeof value === "number" ? value : Number(value);
    if (text === "" && (value === 0 || value === "0" || value === "")) {
      // Пустой ввод остаётся пустым, в расчёте это 0.
    } else if (!Number.isFinite(parsed) || parsed !== incoming) {
      setText(blankNumeric(value));
    }
  }

  return (
    <input
      type="number"
      className={cn(fieldClass, className)}
      ref={ref}
      value={controlled ? text : undefined}
      defaultValue={controlled ? undefined : blankNumeric(defaultValue)}
      onChange={(event) => {
        setText(event.target.value);
        onChange?.(event);
      }}
      {...props}
    />
  );
});
NumberInput.displayName = "NumberInput";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, placeholder: _placeholder, value, defaultValue, onChange, ...props }, ref) => {
    if (type === "number") {
      return (
        <NumberInput
          className={className}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          ref={ref}
          {...props}
        />
      );
    }
    return (
      <input
        type={type}
        className={cn(fieldClass, className)}
        ref={ref}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
