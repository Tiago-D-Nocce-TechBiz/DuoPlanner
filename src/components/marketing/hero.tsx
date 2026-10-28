import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import {
  PlaneTakeoff,
  Sparkles,
  Plane,
  Hotel,
  Wallet,
  ArrowRight,
} from "lucide-react";

/** Hero da Landing Page com preview em vidro (glassmorphism avançado). */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Container className="relative pt-36 pb-20 text-center md:pt-44">
        <span className="glass-surface mx-auto mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs text-foreground">
          <Sparkles className="h-3.5 w-3.5 text-leather" />
          Planejamento pessoal, gratuito e sem anúncios
        </span>
        <h1 className="mx-auto max-w-3xl font-serif text-5xl font-bold leading-[1.05] text-heading md:text-7xl">
          Planeje viagens a dois,{" "}
          <span className="italic text-leather">sem complicações</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-foreground">
          Pesquise voos e hospedagens nos melhores sites, organize o roteiro e
          controle as finanças da dupla — tudo num só lugar. O PlannerDuo
          encontra as opções e leva você direto às páginas certas.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button href="/registo" size="lg" variant="primary">
            <PlaneTakeoff className="h-5 w-5" />
            Começar a planejar
          </Button>
          <Button href="#como-funciona" size="lg" variant="secondary">
            Ver como funciona
          </Button>
        </div>

        {/* Preview em vidro do painel */}
        <div className="glass-surface mx-auto mt-16 max-w-4xl rounded-3xl p-4 md:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Plane, title: "Buscar Viagem", note: "LATAM · Azul · GOL · Google · Skyscanner" },
              { icon: Hotel, title: "Buscar Hospedagem", note: "Airbnb · Booking · Hoteis · Trivago" },
              { icon: Wallet, title: "Finanças Duo", note: "Divida contas com clareza" },
            ].map(({ icon: Icon, title, note }) => (
              <div
                key={title}
                className="rounded-2xl border border-sand-border bg-white/40 p-5 text-left dark:bg-white/[0.03]"
              >
                <div className="mb-3 inline-flex rounded-xl border border-sand-border bg-sand-surface p-2.5">
                  <Icon className="h-5 w-5 text-heading" />
                </div>
                <p className="font-serif text-lg font-semibold text-heading">
                  {title}
                </p>
                <p className="mt-1 text-xs text-foreground">{note}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-leather">
                  Explorar <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
