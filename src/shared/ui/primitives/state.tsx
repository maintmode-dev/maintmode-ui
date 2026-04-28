import type { ReactNode } from "react";

type StateTone = "neutral" | "danger";

type StateProps = {
  title: string;
  children: ReactNode;
  tone?: StateTone;
};

export function LoadingState({ title, children, tone = "neutral" }: StateProps) {
  return (
    <section className="state" data-tone={tone} role="status" aria-live="polite">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}

export function EmptyState({ title, children, tone = "neutral" }: StateProps) {
  return (
    <section className="state" data-tone={tone}>
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}

export function ErrorState({ title, children, tone = "danger" }: StateProps) {
  return (
    <section className="state" data-tone={tone} role="alert">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  );
}
