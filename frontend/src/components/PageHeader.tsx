import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "../lib/utils";
import { useT } from "../lib/i18n";
import { IconButton } from "./ui";

export function PageHeader({
  title,
  subtitle,
  back = true,
  actions,
  className,
  sticky = true,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  back?: boolean;
  actions?: ReactNode;
  className?: string;
  sticky?: boolean;
}) {
  const t = useT();
  const navigate = useNavigate();
  return (
    <header
      className={cn(
        "z-20 flex items-center gap-3 border-b border-border bg-bg/85 px-4 py-3 backdrop-blur-md md:px-6",
        sticky && "sticky top-0",
        className,
      )}
    >
      {back ? (
        <IconButton
          label={t("Back")}
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate("/")
          }
          className="-ml-2 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[17px] font-semibold leading-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-[12px] text-muted">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      ) : null}
    </header>
  );
}

export function SectionHeader({
  title,
  action,
  className,
}: {
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("mb-3 flex items-center justify-between gap-3", className)}
    >
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {action}
    </div>
  );
}

export function PageBody({
  children,
  className,
  wide = false,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-4 md:px-6 md:py-6",
        wide ? "max-w-[1600px]" : "max-w-[1200px]",
        className,
      )}
    >
      {children}
    </div>
  );
}
