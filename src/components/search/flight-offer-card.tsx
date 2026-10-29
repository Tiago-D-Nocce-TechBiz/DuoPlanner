import { AlertTriangle, ArrowUpRight, Shuffle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cardClass } from "@/components/ui/card";
import { daysBetween } from "@/lib/dates";
import type { FlightLeg, FlightOffer } from "@/lib/travel/types";
import { cn, formatCurrency, formatDuration, splitLocalDateTime } from "@/lib/utils";

/** Card de uma combinação de voos vinda da Kiwi.com. */
export function FlightOfferCard({
  offer,
  adults,
  isCheapest,
  isFastest,
}: {
  offer: FlightOffer;
  adults: number;
  isCheapest: boolean;
  isFastest: boolean;
}) {
  const airlines = offer.airlines.map((a) => a.name).join(" + ");

  return (
    <article className={cn(cardClass, "p-5 sm:p-6")}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-serif text-2xl font-semibold tabular-nums text-heading">
            {formatCurrency(offer.price)}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Total para {adults} {adults === 1 ? "passageiro" : "passageiros"} ·{" "}
            {formatCurrency(offer.pricePerPerson)} por pessoa
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {isCheapest && <Badge variant="accent">Melhor preço</Badge>}
          {isFastest && <Badge variant="neutral">Mais rápido</Badge>}
          {offer.isKiwiCombo && (
            <Badge variant="neutral">
              <Shuffle className="h-3 w-3" />
              Combinação Kiwi
            </Badge>
          )}
          {offer.lowCost && <Badge variant="outline">Low-cost</Badge>}
          {offer.withinBudget === false && (
            <Badge variant="outline">Acima do orçamento</Badge>
          )}
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <LegRow label="Ida" leg={offer.outbound} />
        {offer.inbound && <LegRow label="Volta" leg={offer.inbound} />}
      </div>

      {(offer.bagsRecheck || offer.hasAirportChange) && (
        <p className="mt-4 flex items-start gap-2 text-xs text-muted">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {offer.hasAirportChange
            ? "Inclui troca de aeroporto na conexão."
            : "Conexão entre companhias diferentes: pode ser preciso despachar a bagagem de novo."}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <p className="text-xs text-muted">
          {airlines}
          {offer.nightsInDest !== null && ` · ${offer.nightsInDest} noites no destino`}
          {offer.seatsLeft !== null && offer.seatsLeft <= 5 && ` · ${offer.seatsLeft} assentos restantes`}
        </p>
        {offer.bookingUrl && (
          <a
            href={offer.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Reservar na Kiwi.com
            <ArrowUpRight className="h-4 w-4" />
          </a>
        )}
      </div>
    </article>
  );
}

function LegRow({ label, leg }: { label: string; leg: FlightLeg }) {
  const departure = splitLocalDateTime(leg.departureLocal);
  const arrival = splitLocalDateTime(leg.arrivalLocal);
  const dayShift = daysBetween(leg.departureLocal.slice(0, 10), leg.arrivalLocal.slice(0, 10));
  const stops =
    leg.stops === 0 ? "Direto" : `${leg.stops} ${leg.stops === 1 ? "escala" : "escalas"}`;
  const layovers = leg.layovers
    .map((l) => `${l.airport} ${formatDuration(l.minutes)}`)
    .join(" · ");

  return (
    <div className="grid grid-cols-[3.25rem_1fr] items-center gap-3 sm:grid-cols-[4rem_1fr]">
      <p className="text-[11px] font-medium uppercase tracking-wider text-subtle">
        {label}
        <span className="mt-0.5 block normal-case tracking-normal text-muted">{departure.day}</span>
      </p>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums text-heading">{departure.time}</p>
          <p className="text-xs text-muted">{leg.from.iata}</p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <span className="text-xs text-muted">{formatDuration(leg.durationMinutes)}</span>
          <span className="my-1.5 flex h-px w-full items-center justify-evenly bg-border-strong">
            {leg.layovers.map((l) => (
              <span key={`${l.airport}-${l.minutes}`} className="h-1.5 w-1.5 rounded-full bg-muted" />
            ))}
          </span>
          <span className="truncate text-center text-xs text-subtle">
            {stops}
            {layovers && ` · ${layovers}`}
          </span>
        </div>
        <div>
          <p className="text-lg font-semibold tabular-nums text-heading">
            {arrival.time}
            {dayShift > 0 && (
              <sup className="ml-0.5 text-xs font-medium text-muted">+{dayShift}</sup>
            )}
          </p>
          <p className="text-xs text-muted">{leg.to.iata}</p>
        </div>
      </div>
    </div>
  );
}
