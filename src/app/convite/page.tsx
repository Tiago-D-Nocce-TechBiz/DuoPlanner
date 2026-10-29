import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/logo";
import {
  createSupabaseServerClient,
  getCurrentUserId,
} from "@/lib/supabase/server";
import { aceitarConvitePorCodigo } from "@/app/(auth)/actions";

export const metadata = { title: "Convite — PlannerDuo" };

/**
 * Página de convite: /convite?code=CODIGO (ou ?convite=CODIGO).
 *
 * O acesso a cookies/searchParams fica dentro de <Suspense> (ResolvedorConvite)
 * para não bloquear o prerender com o Cache Components ativo.
 */
export default function ConvitePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; convite?: string }>;
}) {
  return (
    <Molde titulo="Processando convite…">
      <Suspense
        fallback={
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Validando seu convite, um instante…
          </p>
        }
      >
        <ResolvedorConvite searchParams={searchParams} />
      </Suspense>
    </Molde>
  );
}

async function ResolvedorConvite({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; convite?: string }>;
}) {
  const sp = await searchParams;
  const codigo = (sp.code ?? sp.convite ?? "").trim();

  if (!codigo) {
    return (
      <>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Nenhum código de convite foi informado. Peça à pessoa que te convidou
          para enviar o link completo.
        </p>
        <Acoes />
      </>
    );
  }

  const supabase = await createSupabaseServerClient();
  const userId = supabase ? await getCurrentUserId(supabase) : null;

  if (!userId) {
    redirect(`/login?convite=${encodeURIComponent(codigo)}`);
  }

  const resultado = await aceitarConvitePorCodigo(codigo);
  if (resultado.ok) {
    redirect("/dashboard");
  }

  return (
    <>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{resultado.mensagem}</p>
      <Acoes />
    </>
  );
}

function Molde({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6">
      <header className="mx-auto w-full max-w-5xl flex items-center justify-between py-2">
        <BrandLogo href="/" />
        <ThemeToggle />
      </header>
      <main className="my-auto mx-auto w-full max-w-md py-8">
        <div className="glass-panel rounded-3xl p-7 sm:p-9 text-center">
          <h1 className="font-serif text-2xl font-bold text-[var(--color-heading)]">
            {titulo}
          </h1>
          {children}
        </div>
      </main>
      <div />
    </div>
  );
}

function Acoes() {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
      <Link
        href="/login"
        className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
      >
        Ir para o acesso
      </Link>
      <Link
        href="/"
        className="px-4 py-2 rounded-xl text-xs font-semibold glass-panel"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
