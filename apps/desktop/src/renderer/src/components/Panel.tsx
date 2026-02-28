import type { PropsWithChildren } from "react";

type PanelProps = PropsWithChildren<{
  title?: string;
  subtitle?: string;
  className?: string;
  rightSlot?: React.ReactNode;
}>;

export function Panel({ title, subtitle, className, rightSlot, children }: PanelProps) {
  return (
    <section className={`panel ${className ?? ""}`.trim()}>
      {(title || subtitle || rightSlot) && (
        <header className="panel-header">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {rightSlot && <div>{rightSlot}</div>}
        </header>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}

