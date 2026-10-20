import {
  createContext,
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Info,
  Loader2,
  X,
} from "lucide-react";
import { cn } from "../lib/utils";
import { useAppStore } from "../lib/store";
import { useT } from "../lib/i18n";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

const buttonVariants: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:brightness-110 active:brightness-95 disabled:opacity-50",
  secondary:
    "bg-surface text-fg border border-border hover:bg-surface2 active:bg-surface2 disabled:opacity-50",
  ghost:
    "bg-transparent text-fg hover:bg-surface2 active:bg-surface2 disabled:opacity-50",
  danger:
    "bg-danger text-white hover:brightness-110 active:brightness-95 disabled:opacity-50",
};

const buttonSizes: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-[15px] gap-2",
  icon: "h-10 w-10 justify-center",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center rounded font-medium transition-[transform,background-color,opacity] duration-100 ease-out active:scale-[0.97] disabled:pointer-events-none",
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : null}
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded text-muted transition-colors duration-100 hover:bg-surface2 hover:text-fg active:scale-[0.97] disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

const fieldClass =
  "w-full rounded border border-border bg-surface px-3 text-sm text-fg placeholder:text-muted/70 transition-shadow duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function Input({ className, ...props }, ref) {
  return (
    <input ref={ref} className={cn(fieldClass, "h-10", className)} {...props} />
  );
});

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(fieldClass, "min-h-[96px] py-2", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(fieldClass, "h-10 appearance-none pr-9", className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-150",
        checked ? "bg-accent" : "bg-border",
        disabled && "opacity-50",
      )}
    >
      <span
        className={cn(
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-150 ease-out",
          checked ? "translate-x-5" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  format?: (value: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-border accent-[rgb(var(--accent))]"
      />
      <span className="w-14 text-right text-xs tabular text-muted">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-card border border-border bg-surface", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-surface2 text-muted",
    accent: "bg-accent/10 text-accent",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-surface2 motion-reduce:animate-none",
        className,
      )}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <Loader2
      className={cn("h-5 w-5 animate-spin text-muted", className)}
      aria-hidden
    />
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-dashed border-border px-6 py-16 text-center">
      {icon ? <div className="text-muted">{icon}</div> : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? (
        <p className="max-w-sm text-[13px] text-muted">{description}</p>
      ) : null}
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  requestId,
  onRetry,
}: {
  message: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-danger/20 bg-danger/5 px-6 py-12 text-center">
      <AlertCircle className="h-6 w-6 text-danger" aria-hidden />
      <p className="text-sm font-medium text-fg">{message}</p>
      {requestId ? (
        <p className="font-mono text-[11px] text-muted">request: {requestId}</p>
      ) : null}
      {onRetry ? (
        <Button size="sm" onClick={onRetry}>
          {t("Retry")}
        </Button>
      ) : null}
    </div>
  );
}

export function AsyncState({
  loading,
  error,
  empty,
  emptyTitle,
  emptyDescription,
  emptyAction,
  onRetry,
  children,
  skeleton,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  onRetry?: () => void;
  children: ReactNode;
  skeleton?: ReactNode;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        {skeleton ?? <Spinner className="h-6 w-6" />}
      </div>
    );
  }
  if (error) {
    const message = error instanceof Error ? error.message : String(error);
    const requestId =
      error && typeof error === "object" && "requestId" in error
        ? String((error as { requestId?: string }).requestId ?? "")
        : undefined;
    return (
      <ErrorState message={message} requestId={requestId} onRetry={onRetry} />
    );
  }
  if (empty) {
    return (
      <EmptyState
        title={emptyTitle ?? "No data"}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }
  return <>{children}</>;
}

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

const FocusContext = createContext(false);

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = ref.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
      if (event.key !== "Tab" || !focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = original;
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <FocusContext.Provider value>
      <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
        <div
          className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          onClick={onClose}
          aria-hidden
        />
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "relative z-10 max-h-[90dvh] w-full overflow-y-auto rounded-t-sheet border border-border bg-surface shadow-pop sm:rounded-sheet",
            width,
          )}
        >
          {title ? (
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <IconButton label="Close" onClick={onClose} className="-mr-2">
                <X className="h-4 w-4" />
              </IconButton>
            </div>
          ) : null}
          <div className="px-5 py-4">{children}</div>
          {footer ? (
            <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    </FocusContext.Provider>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = "right",
  width = "sm:max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: "right" | "left";
  width?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = original;
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "absolute top-0 flex h-[100dvh] w-full flex-col border-border bg-surface shadow-pop",
          width,
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          "transition-transform duration-200 ease-enter",
        )}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 scrollbar-thin">
          {children}
        </div>
        {footer ? (
          <div className="border-t border-border px-4 py-3">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message ? <p className="text-sm text-muted">{message}</p> : null}
    </Modal>
  );
}

export function PromptDialog({
  open,
  title,
  label,
  initialValue = "",
  placeholder,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  onConfirm: (value: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            variant="primary"
            disabled={!value.trim()}
            onClick={() => {
              onConfirm(value.trim());
              onClose();
            }}
          >
            Confirm
          </Button>
        </>
      }
    >
      <Field label={label}>
        <Input
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Navigation / menus
// ---------------------------------------------------------------------------

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 overflow-x-auto scrollbar-thin", className)}
    >
      {items.map((item) => (
        <button
          key={item.value}
          role="tab"
          aria-selected={value === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "relative shrink-0 rounded px-3 py-2 text-[13px] font-medium transition-colors duration-100",
            value === item.value
              ? "text-fg"
              : "text-muted hover:bg-surface2 hover:text-fg",
          )}
        >
          {item.label}
          {item.count !== undefined ? (
            <span className="ml-1.5 text-[11px] text-muted">{item.count}</span>
          ) : null}
          {value === item.value ? (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-accent" />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function Menu({
  trigger,
  items,
  align = "right",
}: {
  trigger: (props: {
    onClick: () => void;
    "aria-expanded": boolean;
  }) => ReactNode;
  items: {
    label: string;
    icon?: ReactNode;
    onSelect: () => void;
    danger?: boolean;
    disabled?: boolean;
  }[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" id={id}>
      {trigger({
        onClick: () => setOpen((value) => !value),
        "aria-expanded": open,
      })}
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-40 mt-1 min-w-[180px] rounded border border-border bg-surface p-1 shadow-pop",
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                "flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-[13px] transition-colors duration-100 hover:bg-surface2 disabled:opacity-40",
                item.danger ? "text-danger" : "text-fg",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

export function ToastHost() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:left-auto sm:right-6 sm:items-end">
      {toasts.map((item) => (
        <div
          key={item.id}
          role="status"
          className={cn(
            "pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-card border px-3.5 py-3 text-[13px] shadow-pop transition-[opacity,transform] duration-150 ease-enter",
            item.kind === "error"
              ? "border-danger/30 bg-surface text-fg"
              : item.kind === "success"
                ? "border-success/30 bg-surface text-fg"
                : "border-border bg-surface text-fg",
          )}
        >
          {item.kind === "success" ? (
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-success"
              aria-hidden
            />
          ) : item.kind === "error" ? (
            <AlertCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-danger"
              aria-hidden
            />
          ) : (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden />
          )}
          <span className="flex-1">{item.message}</span>
          {item.action ? (
            <button
              className="shrink-0 font-medium text-accent"
              onClick={() => {
                item.action?.onClick();
                dismiss(item.id);
              }}
            >
              {item.action.label}
            </button>
          ) : null}
          <button
            aria-label="Dismiss"
            className="shrink-0 text-muted hover:text-fg"
            onClick={() => dismiss(item.id)}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
