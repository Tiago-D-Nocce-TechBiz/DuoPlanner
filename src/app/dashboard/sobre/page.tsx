import { Compass, Plane, Wallet, ShieldCheck, Users } from "@/components/ui/icons";

export const metadata = { title: "Sobre Nós — DuoPlanner" };

const PILARES: { icone: typeof Plane; titulo: string; texto: string }[] = [
  {
    icone: Plane,
    titulo: "Busca integrada",
    texto:
      "Passagens aéreas e de ônibus e hospedagens das principais plataformas, com links já preenchidos nas suas datas.",
  },
  {
    icone: Wallet,
    titulo: "Finanças com privacidade",
    texto:
      "Divisão justa das despesas da viagem e triagem da fatura — o que é pessoal nunca entra na divisão.",
  },
  {
    icone: Users,
    titulo: "Planejamento compartilhado",
    texto:
      "Um convite liga as duas contas ao mesmo espaço: roteiro, alertas e gastos sincronizados em tempo real.",
  },
  {
    icone: ShieldCheck,
    titulo: "Conformidade LGPD",
    texto:
      "Seus dados são tratados com minimização e consentimento, seguindo a Lei Geral de Proteção de Dados.",
  },
];

/** Página institucional "Sobre Nós" dentro do painel. */
export default function SobrePage() {
  return (
    <div className="max-w-3xl space-y-6">
      <section className="nora-surface rounded-3xl border border-[var(--color-border)] p-6 sm:p-8">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
          <Compass className="h-4 w-4" />
          Sobre Nós
        </span>
        <h1 className="mt-3 font-serif text-3xl sm:text-4xl font-bold text-[var(--color-heading)]">
          O DuoPlanner
        </h1>
        <p className="mt-3 text-sm sm:text-base leading-relaxed text-[var(--color-muted)]">
          O DuoPlanner é uma ferramenta pessoal para planejar viagens em um só lugar:
          comparar passagens e hospedagens, montar o roteiro e dividir as despesas com
          privacidade. Nascemos para tirar o estresse do planejamento e deixar mais
          tempo para o que importa — a viagem. Contamos ainda com a <strong>Nora</strong>,
          a assistente de IA que monta buscas, organiza finanças e tira dúvidas.
        </p>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {PILARES.map((p) => {
          const Icone = p.icone;
          return (
            <div
              key={p.titulo}
              className="nora-surface rounded-2xl border border-[var(--color-border)] p-5"
            >
              <div className="h-10 w-10 rounded-xl border border-[var(--color-border)] flex items-center justify-center text-[var(--color-heading)]">
                <Icone className="h-5 w-5" />
              </div>
              <h2 className="mt-3 font-serif text-lg font-bold text-[var(--color-heading)]">{p.titulo}</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted)]">{p.texto}</p>
            </div>
          );
        })}
      </section>
    </div>
  );
}
