import { AwajMark } from "@/components/icons/AwajMark";
import LoginForm from "@/components/LoginForm";

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
          <AwajMark className="mx-auto h-14 w-14" aria-hidden />
          <p className="mt-3 font-display text-3xl font-bold text-white">
            Awaj<span className="text-gold"> ET</span>
          </p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/40 uppercase">
            Social Media Management — Teams only
          </p>
        </div>

        <LoginForm error={error} />
      </div>
    </div>
  );
}
