import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { BrandLogo } from "@/components/brand/logo";
import { obterSessao } from "@/lib/auth/sessao";
import { codigoConviteValido } from "@/lib/auth/seguranca";
import { AceitarConviteForm } from "./aceitar-form";
import { obterConvite } from "./dados";

export const metadata = { title: "Convite — DuoPlanner" };

/**
 * Página de convite: /convite?code=CODIGO (ou ?convite=CODIGO).
 *
 * Abrir o link NÃO aceita o convite: a página mostra quem convidou e o nome
 * do espaço, e o aceite é um POST (Server Action) disparado pelo botão. Antes,
 * o GET já vinculava a conta: um link malicioso aberto por alguém logado o
 * colocava no espaço de outra pessoa, e os gastos "da viagem" iam para lá.
 *
 * O acesso a cookies/searchParams fica dentro de <Suspense> para não
 * bloquear o prerender com o Cache Components ativo.
 */
export default function ConvitePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; convite?: string }>;
}) {
  return (
    <Molde>
      <Suspense
        fallback={
          <p className="mt-2 text-sm text-[var(--color-muted)]">Validando seu convite, um instante…</p>
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
  const codigo = codigoConviteValido(sp.code ?? sp.convite ?? "");

  if (!codigo) {
    return (
      <>
        <h1 className="font-serif text-2xl font-bold text-[var(--color-heading)]">Convite incompleto</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Nenhum código válido foi informado. Peça à pessoa que te convidou para enviar o link completo.
        </p>
        <Acoes />
      </>
    );
  }

  const auth = await obterSessao();
  if (!auth.ok) redirect(`/login?convite=${encodeURIComponent(codigo)}`);

  const info = await obterConvite(codigo, auth.sessao);
  if (!info.valido) {
    return (
      <>
        <h1 className="font-serif text-2xl font-bold text-[var(--color-heading)]">Convite indisponível</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{info.mensagem}</p>
        <Acoes />
      </>
    );
  }

  const quem = info.nomeConvidante ? <strong>{info.nomeConvidante}</strong> : "Seu par";
  return (
    <>
      <h1 className="font-serif text-2xl font-bold text-[var(--color-heading)]">Planejar a viagem juntos?</h1>
      <p className="mt-3 text-sm text-[var(--color-muted)] leading-relaxed">
        {quem} convidou você para o espaço{" "}
        {info.nomeEspaco ? <strong>“{info.nomeEspaco}”</strong> : "compartilhado"} no DuoPlanner.
      </p>
      <ul className="mt-4 space-y-1.5 text-left text-xs text-[var(--color-muted)]">
        <li>• Gastos marcados como da viagem, roteiro, checklist e alertas passam a ser vistos pelos dois.</li>
        <li>• Gastos pessoais e documentos privados continuam só seus.</li>
        <li>• O que você já tinha planejado sozinho(a) vem junto para o espaço do casal.</li>
      </ul>
      <AceitarConviteForm codigo={codigo} />
    </>
  );
}

function Molde({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6">
      <header className="mx-auto w-full max-w-5xl flex items-center justify-between py-2">
        <BrandLogo href="/" />
        <ThemeToggle />
      </header>
      <main className="my-auto mx-auto w-full max-w-md py-8">
        <div className="glass-panel rounded-3xl p-7 sm:p-9 text-center">{children}</div>
      </main>
      <div />
    </div>
  );
}

function Acoes() {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
      <Link
        href="/dashboard"
        className="px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)]"
      >
        Ir para o painel
      </Link>
      <Link href="/" className="px-4 py-2 rounded-xl text-xs font-semibold glass-panel">
        Voltar ao início
      </Link>
    </div>
  );
}
