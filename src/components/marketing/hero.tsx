import { ArrowRight, Hotel, Plane, PlaneTakeoff, Sparkles, Wallet } from "@/components/ui/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Container } from "@/components/ui/container";

/** Hero da Landing Page (Premium Dark) com prévia do painel. */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <Container className="relative pt-36 pb-20 text-center md:pt-44">
        <Badge variant="outline" className="mx-auto mb-6 px-4 py-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          Planejamento pessoal, gratuito e sem anúncios
        </Badge>
        <h1 className="mx-auto max-w-3xl font-serif text-5xl font-semibold leading-[1.05] text-heading md:text-7xl">
          Planeje viagens a dois,{" "}
          <span className="font-normal italic text-muted">sem complicações</span>.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-foreground">
          Passagens com datas flexíveis, hospedagens pelo melhor custo-benefício
          e recibos lidos por IA. A memória da dupla deixa cada busca mais certeira.
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

        {/* Prévia do painel */}
        <Card className="mx-auto mt-16 max-w-4xl rounded-3xl p-4 md:p-6">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { icon: Plane, title: "Buscar Viagem", note: "Kiwi.com · datas flexíveis · low-cost" },
              { icon: Hotel, title: "Buscar Hospedagem", note: "Booking.com · total p/ 2 · custo-benefício" },
              { icon: Wallet, title: "Finanças Duo", note: "Recibos lidos por IA" },
            ].map(({ icon: Icon, title, note }) => (
              <div
                key={title}
                className="rounded-2xl border border-border bg-background p-5 text-left"
              >
                <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-elevated">
                  <Icon className="h-5 w-5 text-heading" />
                </span>
                <p className="font-serif text-lg font-semibold text-heading">{title}</p>
                <p className="mt-1 text-xs text-muted">{note}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-subtle">
                  Explorar <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            ))}
          </div>
        </Card>
      </Container>
    </section>
  );
}
