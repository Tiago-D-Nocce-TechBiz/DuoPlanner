import Image from "next/image";
import { ArrowUpRight, BedDouble, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cardClass } from "@/components/ui/card";
import type { HotelOffer } from "@/lib/travel/types";
import { cn, formatCurrency } from "@/lib/utils";

/** Card de hospedagem vinda da Booking.com, já ranqueada por custo-benefício. */
export function HotelCard({
  hotel,
  best,
  adults,
  nights,
}: {
  hotel: HotelOffer;
  best: boolean;
  adults: number;
  nights: number;
}) {
  return (
    <article className={cn(cardClass, "flex flex-col overflow-hidden")}>
      <div className="relative aspect-[16/10] bg-elevated">
        {hotel.photoUrl ? (
          <Image
            src={hotel.photoUrl}
            alt={`Foto de ${hotel.name}`}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <BedDouble className="h-8 w-8 text-subtle" />
          </div>
        )}
        {best && (
          <Badge variant="accent" className="absolute left-3 top-3 shadow-lg shadow-black/40">
            Melhor custo-benefício
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-lg font-semibold leading-snug text-heading">
            {hotel.name}
          </h3>
          {hotel.reviewScore !== null && (
            <span className="shrink-0 rounded-lg bg-elevated px-2 py-1 text-sm font-semibold tabular-nums text-heading">
              {hotel.reviewScore.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}
            </span>
          )}
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {hotel.stars !== null && (
            <span className="inline-flex items-center gap-0.5" aria-label={`${hotel.stars} estrelas`}>
              {Array.from({ length: hotel.stars }, (_, i) => (
                <Star key={i} className="h-3 w-3 fill-current" aria-hidden />
              ))}
            </span>
          )}
          {hotel.reviewWord && <span>{hotel.reviewWord}</span>}
          {hotel.reviewCount > 0 && (
            <span>{hotel.reviewCount.toLocaleString("pt-BR")} avaliações</span>
          )}
        </p>

        <div className="mt-auto pt-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              {hotel.originalPrice !== null && (
                <p className="text-xs tabular-nums text-subtle line-through">
                  {formatCurrency(hotel.originalPrice, hotel.currency)}
                </p>
              )}
              <p className="font-serif text-2xl font-semibold tabular-nums text-heading">
                {formatCurrency(hotel.totalPrice, hotel.currency)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                Total p/ {adults} {adults === 1 ? "pessoa" : "pessoas"} · {nights}{" "}
                {nights === 1 ? "noite" : "noites"} ·{" "}
                {formatCurrency(hotel.pricePerNight, hotel.currency)}/noite
              </p>
            </div>
            <Badge variant="outline" className="tabular-nums">
              <span title="0–100: combina a nota dos hóspedes com o preço relativo">
                Custo-benefício {hotel.valueScore}
              </span>
            </Badge>
          </div>

          {!hotel.taxesIncluded && (
            <p className="mt-2 text-xs text-subtle">Taxas locais cobradas à parte.</p>
          )}
          {hotel.withinBudget === false && (
            <p className="mt-2 text-xs text-subtle">Acima do orçamento informado.</p>
          )}

          <a
            href={hotel.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent-hover"
          >
            Ver na Booking.com
            <ArrowUpRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </article>
  );
}
