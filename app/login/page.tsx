import { login } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-navy">
      <div className="w-full max-w-sm px-6">
        <div className="text-center">
          <p className="font-display text-3xl font-bold text-white">
            Awaj<span className="text-gold"> ET</span>
          </p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/40 uppercase">
            FB Scheduler — Team only
          </p>
        </div>

        <form
          action={login}
          className="mt-8 rounded-lg border border-white/10 bg-white/5 p-6"
        >
          <label className="flex flex-col gap-2">
            <span className="font-mono text-[11px] tracking-[0.12em] text-white/60 uppercase">
              Access code or client PIN
            </span>
            <input
              type="password"
              name="password"
              required
              autoFocus
              className="rounded-md border border-white/15 bg-navy px-3 py-2.5 text-sm text-white focus:outline-2 focus:outline-gold"
            />
            <span className="font-mono text-[10px] leading-relaxed text-white/30">
              Clients: use the same PIN as your Awaj ET report dashboard.
            </span>
          </label>
          {error && (
            <p className="mt-3 font-mono text-[11px] text-amber">
              That code or PIN didn&apos;t match. Try again.
            </p>
          )}
          <button className="mt-5 w-full rounded-md bg-gold py-2.5 text-sm font-semibold text-navy transition-colors hover:bg-amber hover:text-white">
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
