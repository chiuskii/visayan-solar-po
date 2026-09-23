"use client";

import { useFormAction } from "@/components/client-ui";
import { login, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, onSubmit, pending] = useFormAction<LoginState>(login, {});
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input className="input" id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div>
        <label className="label" htmlFor="password">Password</label>
        <input className="input" id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {state.error && <p className="error-box">{state.error}</p>}
      <button className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
