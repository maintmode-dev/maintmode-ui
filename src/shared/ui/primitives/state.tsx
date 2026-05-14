import type { ReactNode } from "react";

type StateTone = "neutral" | "danger" | "forbidden";

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

type ForbiddenStateProps = {
  title?: string;
  children?: ReactNode;
  roles?: readonly string[];
};

export function ForbiddenState({
  title = "You don’t have access to this page",
  children,
  roles,
}: ForbiddenStateProps) {
  return (
    <section className="state" data-tone="forbidden" role="alert">
      <h2>{title}</h2>
      <p>
        {children ?? "This area requires an admin role. Ask a maintmode admin to grant you access."}
      </p>
      {roles && roles.length > 0 ? (
        <p className="text-xs text-[var(--muted)]">
          Your current roles: <span data-testid="forbidden-roles">{roles.join(", ")}</span>
        </p>
      ) : null}
    </section>
  );
}
