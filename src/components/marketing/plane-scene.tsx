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
  const matAccentWarm = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BRAND_WARM, metalness: 0.5, roughness: 0.4 }),
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
    group.current.rotation.z = Math.sin(t * 0.6) * 0.12;
    group.current.rotation.x = Math.sin(t * 0.4) * 0.06;
  });

  return (
    <Float speed={autoRotate ? 1.4 : 0} rotationIntensity={0} floatIntensity={autoRotate ? 0.5 : 0}>
      {/* O eixo longo da fuselagem é X; rotacionamos para o nariz apontar para a câmera/frente. */}
      <group ref={group} rotation={[0, 0, 0]} scale={1}>
        {/* Fuselagem */}
        <mesh material={matFuselage} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.42, 2.4, 12, 24]} />
        </mesh>

        {/* Faixa de acento na fuselagem */}
        <mesh material={matAccentWarm} rotation={[0, 0, Math.PI / 2]} position={[0, -0.02, 0]}>
          <cylinderGeometry args={[0.425, 0.425, 0.5, 24]} />
        </mesh>

        {/* Cockpit envidraçado (nariz) */}
        <mesh material={matGlass} position={[1.25, 0.18, 0]}>
          <sphereGeometry args={[0.3, 20, 16]} />
        </mesh>

        {/* Nariz cônico */}
        <mesh material={matFuselage} position={[1.45, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.4, 0.5, 24]} />
        </mesh>

        {/* Asa esquerda e direita (com diedro) */}
        <mesh material={matWing} position={[0, -0.05, 1.15]} rotation={[0.12, 0, 0]} castShadow>
          <boxGeometry args={[1.0, 0.06, 1.9]} />
        </mesh>
        <mesh material={matWing} position={[0, -0.05, -1.15]} rotation={[-0.12, 0, 0]} castShadow>
          <boxGeometry args={[1.0, 0.06, 1.9]} />
        </mesh>

        {/* Pontas das asas (winglets) em teal */}
        <mesh material={matAccentTeal} position={[0, 0.08, 2.05]} rotation={[0.3, 0, 0]}>
          <boxGeometry args={[0.5, 0.22, 0.05]} />
        </mesh>
        <mesh material={matAccentTeal} position={[0, 0.08, -2.05]} rotation={[-0.3, 0, 0]}>
          <boxGeometry args={[0.5, 0.22, 0.05]} />
        </mesh>

        {/* Estabilizador horizontal (cauda) */}
        <mesh material={matWing} position={[-1.35, 0.05, 0.55]} castShadow>
          <boxGeometry args={[0.55, 0.05, 0.9]} />
        </mesh>
        <mesh material={matWing} position={[-1.35, 0.05, -0.55]} castShadow>
          <boxGeometry args={[0.55, 0.05, 0.9]} />
        </mesh>

        {/* Estabilizador vertical (leme) em teal */}
        <mesh material={matAccentTeal} position={[-1.4, 0.5, 0]} rotation={[0, 0, 0.1]} castShadow>
          <boxGeometry args={[0.6, 0.7, 0.06]} />
        </mesh>

        {/* Turbinas sob as asas */}
        <mesh material={matTurbine} position={[0.1, -0.3, 0.95]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.7, 20]} />
        </mesh>
        <mesh material={matTurbine} position={[0.1, -0.3, -0.95]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.2, 0.2, 0.7, 20]} />
        </mesh>
        {/* Bocais das turbinas em warm */}
        <mesh material={matAccentWarm} position={[-0.26, -0.3, 0.95]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.2, 0.04, 12, 20]} />
        </mesh>
        <mesh material={matAccentWarm} position={[-0.26, -0.3, -0.95]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.2, 0.04, 12, 20]} />
        </mesh>
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
      camera={{ position: [3.4, 1.6, 4.2], fov: 42 }}
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
