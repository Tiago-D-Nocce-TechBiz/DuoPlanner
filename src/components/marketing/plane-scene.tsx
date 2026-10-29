"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Environment, Float, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/**
 * Cena 3D do avião realista (Three.js via react-three-fiber).
 *
 * - Modelo poligonal: fuselagem (cápsula), cockpit envidraçado, asas com leve
 *   diedro, estabilizadores horizontal e vertical, duas turbinas.
 * - Materiais físicos (metalness/roughness) + iluminação de estúdio
 *   (key/fill/rim) e um Environment para reflexos realistas.
 * - Ocioso: auto-rotação suave (banking) dá vida ao modelo.
 * - Interação: OrbitControls com damping permite girar livremente em todos os
 *   ângulos (yaw/pitch) segurando o mouse; zoom/pan desativados para não
 *   descolar da composição.
 *
 * Observação de cor: usamos os tons de marca (warm/teal) convertidos para hex,
 * pois materiais 3D não leem variáveis CSS.
 */

const BRAND_WARM = "#C87D55";
const BRAND_TEAL = "#2C5E5A";
const METAL = "#E8E4DB";
const INK = "#1C1917";

function Airplane({ autoRotate }: { autoRotate: boolean }) {
  const group = useRef<THREE.Group>(null);

  // Materiais memorizados (evita recriar a cada frame).
  const matFuselage = useMemo(
    () => new THREE.MeshStandardMaterial({ color: METAL, metalness: 0.85, roughness: 0.28 }),
    []
  );
  const matWing = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#F3EFE6", metalness: 0.6, roughness: 0.35 }),
    []
  );
  const matAccentTeal = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BRAND_TEAL, metalness: 0.5, roughness: 0.4 }),
    []
  );
  const matGlass = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#0B1220",
        metalness: 0.2,
        roughness: 0.05,
        transmission: 0.6,
        transparent: true,
        opacity: 0.85,
      }),
    []
  );
  const matTurbine = useMemo(
    () => new THREE.MeshStandardMaterial({ color: INK, metalness: 0.9, roughness: 0.3 }),
    []
  );

  // Auto-rotação com leve "banking" (balanço) quando ocioso.
  useFrame((state, delta) => {
    if (!group.current || !autoRotate) return;
    group.current.rotation.y += delta * 0.35;
    const t = state.clock.getElapsedTime();
    group.current.rotation.z = Math.sin(t * 0.6) * 0.1;
    group.current.rotation.x = Math.sin(t * 0.4) * 0.05;
  });

  /*
   * Jato comercial de passageiros (airliner), modelo original inspirado no
   * estilo de referência: fuselagem longa e esguia, asas enflechadas (varridas
   * para trás) montadas na parte baixa, duas turbinas sob as asas e cauda com
   * estabilizadores. Eixo longo da fuselagem = X (nariz em +X).
   *
   * Escala geral reduzida (0.62) conforme pedido.
   */
  return (
    <Float speed={autoRotate ? 1.2 : 0} rotationIntensity={0} floatIntensity={autoRotate ? 0.4 : 0}>
      <group ref={group} scale={0.62}>
        {/* Fuselagem longa e esguia */}
        <mesh material={matFuselage} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.34, 3.6, 16, 28]} />
        </mesh>

        {/* Nariz cônico suave */}
        <mesh material={matFuselage} position={[2.08, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.33, 0.6, 28]} />
        </mesh>

        {/* Cockpit envidraçado junto ao nariz */}
        <mesh material={matGlass} position={[1.78, 0.14, 0]} scale={[1.1, 0.7, 0.9]}>
          <sphereGeometry args={[0.26, 20, 16]} />
        </mesh>

        {/* Faixa de acento ao longo da fuselagem */}
        <mesh material={matAccentTeal} rotation={[0, 0, Math.PI / 2]} position={[0, 0.16, 0]} scale={[1, 1, 1.002]}>
          <cylinderGeometry args={[0.345, 0.345, 3.4, 28, 1, true, 0, Math.PI * 0.6]} />
        </mesh>

        {/*
         * Asas enflechadas (baixas). Cada asa é um box girado em Y para dar o
         * enflechamento (sweep) e levemente em X para o diedro. Posicionadas no
         * centro-traseiro da fuselagem, como num airliner.
         */}
        <group position={[-0.1, -0.22, 0]}>
          {/* asa direita (+Z) */}
          <mesh material={matWing} position={[-0.35, 0.02, 1.25]} rotation={[0.07, -0.6, 0]} castShadow>
            <boxGeometry args={[1.5, 0.07, 0.95]} />
          </mesh>
          {/* asa esquerda (-Z) */}
          <mesh material={matWing} position={[-0.35, 0.02, -1.25]} rotation={[-0.07, 0.6, 0]} castShadow>
            <boxGeometry args={[1.5, 0.07, 0.95]} />
          </mesh>
          {/* winglets nas pontas */}
          <mesh material={matAccentTeal} position={[-1.05, 0.14, 2.0]} rotation={[0, -0.6, 0.5]}>
            <boxGeometry args={[0.5, 0.26, 0.05]} />
          </mesh>
          <mesh material={matAccentTeal} position={[-1.05, 0.14, -2.0]} rotation={[0, 0.6, -0.5]}>
            <boxGeometry args={[0.5, 0.26, 0.05]} />
          </mesh>
        </group>

        {/* Turbinas suspensas sob as asas (à frente do bordo de ataque) */}
        <group position={[0.1, -0.42, 0]}>
          <mesh material={matTurbine} position={[0, 0, 1.0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.17, 0.19, 0.78, 20]} />
          </mesh>
          <mesh material={matTurbine} position={[0, 0, -1.0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.17, 0.19, 0.78, 20]} />
          </mesh>
          {/* entradas de ar (anel claro) */}
          <mesh material={matWing} position={[0.4, 0, 1.0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.17, 0.035, 12, 20]} />
          </mesh>
          <mesh material={matWing} position={[0.4, 0, -1.0]} rotation={[0, 0, Math.PI / 2]}>
            <torusGeometry args={[0.17, 0.035, 12, 20]} />
          </mesh>
          {/* pilones ligando turbina à asa */}
          <mesh material={matFuselage} position={[-0.1, 0.2, 1.0]}>
            <boxGeometry args={[0.5, 0.22, 0.06]} />
          </mesh>
          <mesh material={matFuselage} position={[-0.1, 0.2, -1.0]}>
            <boxGeometry args={[0.5, 0.22, 0.06]} />
          </mesh>
        </group>

        {/* Empenagem (cauda) */}
        <group position={[-1.95, 0.08, 0]}>
          {/* estabilizadores horizontais, também enflechados */}
          <mesh material={matWing} position={[-0.1, 0, 0.5]} rotation={[0.05, -0.5, 0]} castShadow>
            <boxGeometry args={[0.72, 0.05, 0.5]} />
          </mesh>
          <mesh material={matWing} position={[-0.1, 0, -0.5]} rotation={[-0.05, 0.5, 0]} castShadow>
            <boxGeometry args={[0.72, 0.05, 0.5]} />
          </mesh>
          {/* leme vertical alto, enflechado, em teal */}
          <mesh material={matAccentTeal} position={[-0.25, 0.62, 0]} rotation={[0, 0, 0.42]} castShadow>
            <boxGeometry args={[0.85, 0.78, 0.06]} />
          </mesh>
        </group>
      </group>
    </Float>
  );
}

export function PlaneScene() {
  const [interagindo, setInteragindo] = useState(false);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <Canvas
      camera={{ position: [3.0, 1.5, 3.8], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent", cursor: interagindo ? "grabbing" : "grab" }}
      onPointerDown={() => setInteragindo(true)}
      onPointerUp={() => setInteragindo(false)}
    >
      {/* Iluminação de estúdio */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 6, 4]} intensity={2.1} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.8} color={BRAND_WARM} />
      <directionalLight position={[0, -3, 2]} intensity={0.5} color={BRAND_TEAL} />

      {/* Reflexos realistas sem textura externa */}
      <Environment preset="city" />

      <Airplane autoRotate={!interagindo && !prefersReduced} />

      <OrbitControls
        enablePan={false}
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.9}
        makeDefault
      />
    </Canvas>
  );
}
