"use client";

import React from "react";

/**
 * Error Boundary genérico (client).
 *
 * Captura erros de renderização dos componentes filhos e exibe um fallback em
 * PT-BR, impedindo que uma falha pontual (ex.: dado externo inesperado) derrube
 * a página inteira ("tela branca"). Oferece um botão para tentar novamente.
 */
interface Props {
  children: React.ReactNode;
  titulo?: string;
  descricao?: string;
  /**
   * Fallback customizado. Quando fornecido, substitui o painel padrão
   * (útil para degradar silenciosamente, ex.: cair num emblema 2D).
   */
  fallback?: React.ReactNode;
}

interface State {
  erro: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { erro: false };
  }

  static getDerivedStateFromError(): State {
    return { erro: true };
  }

  componentDidCatch(error: unknown) {
    // Log no console para diagnóstico; não interrompe a experiência.
    console.error("[ErrorBoundary]", error);
  }

  private reset = () => this.setState({ erro: false });

  render() {
    if (!this.state.erro) return this.props.children;

    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <div className="glass-panel rounded-2xl p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-black/5 dark:bg-white/10 text-xl">
          ⚠️
        </div>
        <h2 className="font-serif text-xl font-semibold text-[var(--color-heading)]">
          {this.props.titulo ?? "Algo não carregou como esperado"}
        </h2>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {this.props.descricao ??
            "Tivemos um problema ao montar esta seção. Você pode tentar novamente."}
        </p>
        <button
          type="button"
          onClick={this.reset}
          className="mt-5 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-accent)] text-[var(--color-accent-foreground)] cursor-pointer"
        >
          Tentar novamente
        </button>
      </div>
    );
  }
}
