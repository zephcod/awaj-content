"use client";

import { useFormStatus } from "react-dom";
import { login } from "@/app/login/actions";

function Spinner() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

function Fields({ error }: { error?: string }) {
  const { pending } = useFormStatus();

  return (
    <fieldset disabled={pending} className="contents">
      <label className="flex flex-col gap-2">
        <span className="font-mono text-[11px] tracking-[0.12em] text-white/60 uppercase">
          Access code or client PIN
        </span>
        <input
          type="password"
          name="password"
          required
          autoFocus
          className="rounded-md border border-white/15 bg-navy px-3 py-2.5 text-sm text-white focus:outline-2 focus:outline-gold disabled:opacity-60"
        />
        <span className="font-mono text-[10px] leading-relaxed text-white/30">
          Clients: use the same PIN as your Awaj ET report dashboard.
        </span>
      </label>

      {error && !pending && (
        <p className="mt-3 font-mono text-[11px] text-amber">
          That code or PIN didn&apos;t match. Try again.
        </p>
      )}

      <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-gold py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-amber hover:text-white disabled:cursor-wait disabled:opacity-80">
        {pending ? (
          <>
            <Spinner />
            Checking…
          </>
        ) : (
          "Enter"
        )}
      </button>
    </fieldset>
  );
}

export default function LoginForm({ error }: { error?: string }) {
  return (
    <form
      action={login}
      className="mt-8 rounded-lg border border-white/10 bg-white/5 p-6"
    >
      <Fields error={error} />
    </form>
  );
}
