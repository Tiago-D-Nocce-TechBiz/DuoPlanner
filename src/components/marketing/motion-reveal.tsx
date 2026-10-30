"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Animações de scroll no estilo "Brikken+Co Strategic Design Studio".
 *
 * São apenas camadas de MOVIMENTO sobre o layout existente — não alteram
 * estrutura, cores, textos nem classes. Cada elemento sobe e aparece ao entrar
 * na viewport (reveal on scroll), com variação escalonada (stagger) em listas.
 *
 * Respeita `prefers-reduced-motion`: quem desativa animações no sistema recebe
 * o conteúdo estático, sem transições.
 */

const EASE_SAIDA = [0.22, 1, 0.36, 1] as const;

/** Sobe + aparece. Usado em blocos e itens individuais. */
function variantesSubida(reduzido: boolean): Variants {
  if (reduzido) {
    return {
      oculto: { opacity: 1, y: 0 },
      visivel: { opacity: 1, y: 0 },
    };
  }
  return {
    oculto: { opacity: 0, y: 28 },
    visivel: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.7, ease: EASE_SAIDA },
    },
  };
}

/**
 * Bloco que revela ao entrar na viewport. `delay` escalona várias seções.
 * `as` permite escolher a tag (section/div) sem perder semântica.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "header" | "footer";
}) {
  const reduzido = useReducedMotion() ?? false;
  const Tag = motion[as];
  const v = variantesSubida(reduzido);

  return (
    <Tag
      className={className}
      variants={v}
      initial="oculto"
      whileInView="visivel"
      viewport={{ once: true, amount: 0.2 }}
      transition={reduzido ? undefined : { duration: 0.7, ease: EASE_SAIDA, delay }}
    >
      {children}
    </Tag>
  );
}

/**
 * Container que escalona a entrada dos filhos (stagger). Combine com
 * <RevealItem> em cada filho direto (ex.: cards do Bento Grid).
 */
export function RevealStagger({
  children,
  className,
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const reduzido = useReducedMotion() ?? false;
  return (
    <motion.div
      className={className}
      initial="oculto"
      whileInView="visivel"
      viewport={{ once: true, amount: 0.15 }}
      variants={{
        oculto: {},
        visivel: {
          transition: { staggerChildren: reduzido ? 0 : stagger },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/** Filho de <RevealStagger>: sobe/aparece conforme o escalonamento do pai. */
export function RevealItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const reduzido = useReducedMotion() ?? false;
  return (
    <motion.div className={className} variants={variantesSubida(reduzido)}>
      {children}
    </motion.div>
  );
}

/**
 * Revela o wordmark monumental com máscara: o texto "sobe" de baixo de uma
 * linha de corte (overflow hidden), efeito editorial do Brikken+Co.
 */
export function MaskReveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduzido = useReducedMotion() ?? false;
  if (reduzido) return <div className={className}>{children}</div>;

  return (
    <div className={`overflow-hidden ${className ?? ""}`}>
      <motion.div
        initial={{ y: "110%" }}
        whileInView={{ y: "0%" }}
        viewport={{ once: true, amount: 0.4 }}
        transition={{ duration: 0.9, ease: EASE_SAIDA, delay }}
      >
        {children}
      </motion.div>
    </div>
  );
}
