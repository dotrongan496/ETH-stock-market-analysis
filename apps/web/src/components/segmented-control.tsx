export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  title?: string;
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentOption<T>>;
  onChange: (value: T) => void;
  /** Stretch to the parent's width, buttons sharing it equally. */
  fullWidth?: boolean;
}

export default function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
  fullWidth = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`${fullWidth ? "flex w-full" : "inline-flex"} h-9 items-stretch rounded-md border border-line bg-canvas p-0.5`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            aria-pressed={active}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`whitespace-nowrap rounded px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40 ${
              fullWidth ? "flex-1" : ""
            } ${
              active
                ? "bg-raised text-ink shadow-sm shadow-black/40"
                : "text-muted enabled:hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
