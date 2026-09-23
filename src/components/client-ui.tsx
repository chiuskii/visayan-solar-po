"use client";

import { startTransition, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn btn-primary", pendingText = "Saving…" }: {
  children: React.ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingText : children}
    </button>
  );
}

/** A button that asks "Are you sure?" inline before submitting its form action. */
export function ConfirmButton({
  action,
  label,
  confirmLabel = "Yes, continue",
  className = "btn btn-danger",
  hidden,
}: {
  action: (formData: FormData) => void | Promise<void>;
  label: string;
  confirmLabel?: string;
  className?: string;
  hidden?: Record<string, string | number>;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={className} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <form action={action} className="inline-flex items-center gap-2">
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <SubmitButton className="btn btn-danger" pendingText="Working…">{confirmLabel}</SubmitButton>
      <button type="button" className="btn" onClick={() => setAsking(false)}>
        Keep
      </button>
    </form>
  );
}

/**
 * Like useActionState, but submits via onSubmit so React doesn't clear the form
 * afterwards — a validation error keeps everything the user typed.
 */
export function useFormAction<S extends object>(action: (prev: S, fd: FormData) => Promise<S>, initial: S) {
  const [state, run, pending] = useActionState<S, FormData>(action, initial as Awaited<S>);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => run(fd));
  };
  return [state, onSubmit, pending] as const;
}
