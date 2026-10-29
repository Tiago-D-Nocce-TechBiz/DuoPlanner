/**
 * Conteúdo jurídico dos Termos de Uso + LGPD do PlannerDuo.
 * Reutilizado na rota pública (/termos) e no painel (/dashboard/termos).
 *
 * AVISO: texto-modelo para um app pessoal e gratuito. Não substitui
 * aconselhamento jurídico profissional; revise antes de publicar.
 */

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="font-serif text-2xl font-semibold text-heading">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-foreground">
        {children}
      </div>
    </section>
  );
}

export function TermsContent() {
  return (
    <article className="space-y-10">
      <header>
        <h1 className="font-serif text-4xl font-bold text-heading">
          Termos de Uso &amp; Política de Privacidade (LGPD)
        </h1>
        <p className="mt-2 text-sm text-muted">
          Última atualização: 29 de outubro de 2026.
        </p>
      </header>

      <Section title="1. Aceitação dos Termos">
        <p>
          Ao acessar e utilizar o PlannerDuo (&quot;Plataforma&quot;), você
          declara ter lido, compreendido e aceitado integralmente estes Termos
          de Uso. Caso não concorde, não utilize a Plataforma.
        </p>
      </Section>

      <Section title="2. Natureza do serviço — agregador e redirecionador">
        <p>
          O PlannerDuo é uma ferramenta pessoal e gratuita de planejamento de
          viagens que funciona como <strong>agregador e redirecionador de
          buscas</strong> (deep linking). A Plataforma não vende passagens,
          não intermedeia reservas e não processa pagamentos.
        </p>
        <p>
          A partir dos dados informados por você (origem, destino, datas,
          passageiros e preferências), consultamos as APIs de parceiros
          (<strong>Kiwi.com</strong> para voos e <strong>Booking.com</strong>,
          via RapidAPI, para hospedagens) e geramos <strong>links
          pré-preenchidos</strong> que direcionam a páginas de terceiros, como
          LATAM, Azul, GOL, Google Flights, Skyscanner, Airbnb, Booking.com,
          Hoteis.com e Trivago. Preços, disponibilidade, condições, reservas e
          pagamentos são de responsabilidade exclusiva dessas plataformas
          parceiras, regidos pelos termos e políticas próprios de cada uma.
        </p>
        <p>
          Recursos de inteligência artificial (leitura de recibos, memória de
          preferências e sugestões de experiências) podem conter imprecisões.
          Confira valores, datas, horários e regras antes de decidir.
        </p>
        <p>
          O PlannerDuo não garante a exatidão, disponibilidade ou atualização
          das informações exibidas pelos sites de destino e não se
          responsabiliza por eventuais divergências, falhas ou prejuízos
          decorrentes das transações realizadas com terceiros.
        </p>
      </Section>

      <Section title="3. Uso pessoal e não corporativo">
        <p>
          A Plataforma destina-se ao uso pessoal e não corporativo. É vedado o
          uso para fins comerciais, revenda, raspagem automatizada em larga
          escala ou qualquer finalidade ilícita.
        </p>
      </Section>

      <Section title="4. Conta e responsabilidade do usuário">
        <p>
          Você é responsável pela veracidade dos dados informados e pela guarda
          das credenciais de acesso. Atividades realizadas na sua conta são de
          sua responsabilidade.
        </p>
      </Section>

      {/* ------------------------------ LGPD ------------------------------ */}
      <Section id="lgpd" title="5. Privacidade e Proteção de Dados (LGPD)">
        <p>
          Esta seção descreve o tratamento de dados pessoais em conformidade
          com a <strong>Lei nº 13.709/2018 — Lei Geral de Proteção de Dados
          Pessoais (LGPD)</strong>.
        </p>

        <h3 className="pt-2 font-semibold text-heading">5.1. Dados coletados</h3>
        <p>
          Tratamos os seguintes dados, fornecidos por você ou gerados pelo uso:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Itinerários e buscas:</strong> origem, destino, datas,
            número de passageiros/hóspedes, quartos e classe de viagem.
          </li>
          <li>
            <strong>Despesas:</strong> títulos, valores, moedas e datas
            informados ou extraídos de notas/recibos. A imagem do recibo é
            processada para leitura e não fica armazenada.
          </li>
          <li>
            <strong>Preferências e memória da IA:</strong> cidade base,
            aeroporto base, moeda, orçamentos, limites de escala, interesses e
            o histórico das mensagens enviadas à IA para memorizá-los.
          </li>
          <li>
            <strong>Dados de conta:</strong> nome e e-mail de cadastro.
          </li>
        </ul>

        <h3 className="pt-2 font-semibold text-heading">
          5.2. Finalidade e base legal
        </h3>
        <p>
          Os dados são tratados para viabilizar o funcionamento da Plataforma —
          gerar buscas, salvar histórico de viagens e organizar finanças. As
          bases legais aplicáveis são:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Execução de contrato e procedimentos preliminares</strong>{" "}
            (Art. 7º, V, da LGPD), para prestação das funcionalidades
            solicitadas por você.
          </li>
          <li>
            <strong>Consentimento</strong> (Art. 7º, I, da LGPD), quando
            aplicável a tratamentos específicos, revogável a qualquer momento.
          </li>
        </ul>

        <h3 className="pt-2 font-semibold text-heading">
          5.3. Direitos do titular (Art. 18 da LGPD)
        </h3>
        <p>Você pode, a qualquer tempo e mediante requisição, exercer:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong>Acesso</strong> aos dados tratados;</li>
          <li><strong>Correção</strong> de dados incompletos, inexatos ou desatualizados;</li>
          <li><strong>Portabilidade</strong> dos dados a outro fornecedor;</li>
          <li>
            <strong>Eliminação imediata</strong> dos dados tratados com
            consentimento, bem como anonimização ou bloqueio de dados
            desnecessários ou tratados em desconformidade.
          </li>
        </ul>

        <h3 className="pt-2 font-semibold text-heading">
          5.4. Armazenamento em nuvem
        </h3>
        <p>
          Os dados são armazenados em infraestrutura de nuvem do{" "}
          <strong>Supabase</strong>, com medidas técnicas e administrativas de
          segurança, incluindo controle de acesso por linha (Row Level
          Security). A transmissão ocorre por conexões criptografadas (HTTPS).
        </p>

        <h3 className="pt-2 font-semibold text-heading">
          5.5. Compartilhamento com provedores
        </h3>
        <p>
          Para executar as funcionalidades pedidas por você, compartilhamos o
          mínimo necessário com operadores: <strong>Google (Gemini API)</strong>{" "}
          recebe as imagens de recibos e os textos enviados à IA;{" "}
          <strong>Kiwi.com</strong> e <strong>Booking.com/RapidAPI</strong>{" "}
          recebem os parâmetros das buscas (destinos, datas e número de
          viajantes). Nenhum desses dados é vendido ou usado para publicidade.
        </p>

        <h3 className="pt-2 font-semibold text-heading">
          5.6. Canal de contato do Controlador / Encarregado (DPO)
        </h3>
        <p>
          Para exercer seus direitos ou esclarecer dúvidas sobre o tratamento de
          dados, contate o Controlador e Encarregado (DPO):
        </p>
        <ul className="list-none space-y-1 pl-0">
          <li><strong>Responsável:</strong> Tiago D. Nocce (desenvolvedor e controlador)</li>
          <li><strong>E-mail do Encarregado (DPO):</strong> dpo@plannerduo.app</li>
        </ul>
        <p>
          As solicitações serão respondidas nos prazos e na forma previstos pela
          LGPD.
        </p>
      </Section>

      <Section title="6. Alterações destes Termos">
        <p>
          Estes Termos podem ser atualizados periodicamente. A versão vigente é
          sempre a publicada nesta página, com a data de atualização indicada no
          topo.
        </p>
      </Section>

      <Section title="7. Foro">
        <p>
          Estes Termos são regidos pelas leis da República Federativa do Brasil.
        </p>
      </Section>
    </article>
  );
}
