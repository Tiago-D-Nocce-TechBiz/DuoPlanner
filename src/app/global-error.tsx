"use client";

import { useEffect } from "react";
import { codigoDoErro } from "@/lib/erros/codigo";

/**
 * Último recurso: erro no layout raiz. Substitui o documento inteiro, então
 * traz o próprio <html>, <body> e estilos (inline: o CSS do app pode ser
 * justamente o que falhou ao carregar). Segue o tema do sistema.
 */

const ESTILOS = `
  :root { color-scheme: light dark; --fundo: #EAE7E0; --cartao: #FBF9F4; --texto: #12100E; --suave: #57534E; --borda: #B6A48B; --botao: #181512; --botao-texto: #FAF8F5; }
  @media (prefers-color-scheme: dark) {
    :root { --fundo: #090D16; --cartao: #1A2234; --texto: #FAFAFA; --suave: #A1A1AA; --borda: rgba(234,216,192,.38); --botao: #F5F2EB; --botao-texto: #090D16; }
  }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; box-sizing: border-box;
         background: var(--fundo); color: var(--texto); font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  .cartao { max-width: 440px; background: var(--cartao); border: 1px solid var(--borda); border-radius: 20px; padding: 32px; text-align: center; }
  h1 { font-family: Georgia, "Times New Roman", serif; font-size: 24px; margin: 0 0 8px; }
  p { color: var(--suave); font-size: 14px; line-height: 1.5; margin: 0; }
  .acoes { margin-top: 24px; display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  button, a { font: inherit; font-size: 12px; font-weight: 600; border-radius: 12px; padding: 10px 16px; cursor: pointer; text-decoration: none; }
  button { background: var(--botao); color: var(--botao-texto); border: 0; }
  a { color: var(--texto); border: 1px solid var(--borda); }
  .codigo { margin-top: 20px; font-size: 11px; }
`;

export default function ErroGlobal({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("[erro global]", error);
  }, [error]);
  const codigo = codigoDoErro(error);

  return (
    <html lang="pt-BR">
      <head>
        <title>Algo deu errado — DuoPlanner</title>
        <style dangerouslySetInnerHTML={{ __html: ESTILOS }} />
      </head>
      <body>
        <main role="alert" className="cartao">
          <h1>O DuoPlanner encontrou um erro</h1>
          <p>
            Não foi possível abrir o aplicativo agora. O que já estava salvo neste aparelho continua guardado. Tente de novo
            em instantes.
          </p>
          <div className="acoes">
            <button type="button" onClick={() => retry()}>
              Tentar de novo
            </button>
            {/* Navegação completa de propósito: o app pode estar sem o layout. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Voltar ao início</a>
          </div>
          {codigo && <p className="codigo">Código do erro: {codigo}</p>}
        </main>
      </body>
    </html>
  );
}
