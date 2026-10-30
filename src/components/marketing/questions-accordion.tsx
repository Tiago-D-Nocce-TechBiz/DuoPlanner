"use client";

import { Plus } from "@/components/ui/icons";

/**
 * Acordeão editorial da Landing Page ("Perguntas que valem a pena fazer").
 *
 * Usa <details>/<summary> nativos (acessível por padrão, funciona sem JS). O
 * ícone de "+" gira para "×" quando o item está aberto (via `.accordion-item[open]`).
 * Monocromático — herda os tokens de tema. Nenhuma cor fixa.
 */

const PERGUNTAS: { indice: string; titulo: string; resposta: string }[] = [
  {
    indice: "01",
    titulo: "Como funciona a busca integrada de Voos, Ônibus e Hospedagens?",
    resposta:
      "Você informa origem, destino e datas uma única vez. O DuoPlanner monta buscas já pré-preenchidas nas principais plataformas — LATAM, Azul, GOL, Google Flights, Skyscanner e Decolar para voos; Guanabara, Buser, UTIL, ClickBus, DeÔnibus, FlixBus, Gontijo e Cometa para ônibus; Airbnb, Booking, Hoteis.com, Trivago, Vrbo e mais para hospedagem. Um clique abre cada parceiro com seus dados prontos. O Concierge de IA ainda interpreta uma frase em português e preenche tudo por você.",
  },
  {
    indice: "02",
    titulo: "Como funciona o compartilhamento sincronizado entre o casal?",
    resposta:
      "Cada conta cria um espaço compartilhado e convida o parceiro ou parceira por e-mail. As duas contas passam a ver o mesmo roteiro, os mesmos alertas e as despesas da viagem em tempo real, sem precisar reenviar prints ou planilhas. O convite é vinculado ao espaço da dupla, então tudo fica no lugar certo.",
  },
  {
    indice: "03",
    titulo: "Como a Triagem da Fatura Nubank protege a privacidade dos meus gastos pessoais?",
    resposta:
      "Ao importar um CSV do Nubank, uma nota fiscal ou um texto colado, cada item passa por uma tela de triagem antes de entrar na conta compartilhada. Só o que você marca como gasto da viagem fica visível para a outra conta — qualquer item pessoal permanece privado e nunca entra na divisão a dois. Por segurança, o que não é reconhecido entra como pessoal por padrão.",
  },
];

export function QuestionsAccordion() {
  return (
    <div className="flex flex-col">
      {PERGUNTAS.map((p) => (
        <details key={p.indice} className="accordion-item group">
          <summary className="flex items-start gap-4 py-6 sm:py-7">
            <span className="bento-index text-sm sm:text-base pt-1 shrink-0">
              {p.indice}
            </span>
            <span className="flex-1 font-serif text-lg sm:text-2xl font-semibold text-[var(--color-heading)] leading-snug">
              {p.titulo}
            </span>
            <Plus className="accordion-plus h-5 w-5 sm:h-6 sm:w-6 mt-1 shrink-0 text-[var(--color-muted)]" />
          </summary>
          <p className="pb-6 sm:pb-7 pl-0 sm:pl-12 pr-0 sm:pr-10 -mt-1 text-sm sm:text-base leading-relaxed text-[var(--color-muted)] max-w-3xl">
            {p.resposta}
          </p>
        </details>
      ))}
    </div>
  );
}
