/**
 * A requisição veio de uma página do próprio app? Defesa contra CSRF nas
 * rotas POST (`/api/vitals`, `/api/experiencias`), no mesmo critério que o
 * Next aplica às Server Actions: o host do `Origin` tem de ser o
 * `x-forwarded-host` (atrás do proxy da Vercel) ou o `host`.
 *
 * `Sec-Fetch-Site` é posto pelo navegador e não pode ser forjado por script:
 * se vier, tem de ser `same-origin`. Sem `Origin` e sem `Sec-Fetch-Site`, a
 * requisição não veio de um navegador atual na nossa página: recusada.
 */
export function daMesmaOrigem(cabecalhos: Headers): boolean {
  const site = cabecalhos.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;

  const origem = cabecalhos.get("origin");
  if (!origem) return site === "same-origin";

  let hostDaOrigem: string;
  try {
    hostDaOrigem = new URL(origem).host;
  } catch {
    return false;
  }
  const encaminhado = cabecalhos.get("x-forwarded-host")?.split(",")[0]?.trim();
  return hostDaOrigem === encaminhado || hostDaOrigem === cabecalhos.get("host");
}
