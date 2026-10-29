"use client";

import React, { Suspense, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bounds, Center, Environment, Float, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/**
 * Cena 3D do avião (Three.js via react-three-fiber).
 *
 * Fonte do modelo:
 * - Se existir `public/models/aviao.glb`, esse modelo pronto (ex.: baixado do
 *   Poly Pizza / Sketchfab / Khronos, licença CC0/CC-BY) é carregado e exibido.
 *   O <Bounds>/<Center> centraliza e dimensiona automaticamente qualquer GLB,
 *   então não importa como ele foi exportado — fica no tamanho certo.
 * - Se o arquivo não existir (ou falhar o carregamento), caímos no avião
 *   procedural como fallback, sem quebrar a página.
 *
 * Interação: OrbitControls com damping gira livremente em todos os ângulos.
 * Ocioso: auto-rotação suave com leve balanço.
 */

const MODEL_URL = "/models/aviao.glb";

const BRAND_WARM = "#C87D55";
const BRAND_TEAL = "#2C5E5A";
const METAL = "#E8E4DB";
const INK = "#1C1917";

/** Aplica auto-rotação + balanço a um grupo quando `autoRotate` é true. */
function useIdleSpin(ref: React.RefObject<THREE.Group | null>, autoRotate: boolean) {
  useFrame((state, delta) => {
    const g = ref.current;
    if (!g || !autoRotate) return;
    g.rotation.y += delta * 0.35;
    const t = state.clock.getElapsedTime();
    g.rotation.z = Math.sin(t * 0.6) * 0.1;
    g.rotation.x = Math.sin(t * 0.4) * 0.05;
  });
}

/** Modelo pronto carregado de um arquivo .glb em public/models/aviao.glb. */
function GltfPlane({ autoRotate }: { autoRotate: boolean }) {
  const group = useRef<THREE.Group>(null);
  // Segundo argumento = true liga o decoder Draco (o .glb foi comprimido com Draco).
  const { scene } = useGLTF(MODEL_URL, true);
  // Clona para evitar efeitos colaterais se o mesmo GLTF for reutilizado.
  const model = useMemo(() => scene.clone(true), [scene]);
  useIdleSpin(group, autoRotate);

  return (
    <Float speed={autoRotate ? 1.2 : 0} rotationIntensity={0} floatIntensity={autoRotate ? 0.4 : 0}>
      {/* Bounds mede o modelo e ajusta a câmera; Center o coloca na origem.
          fit + margin garantem que qualquer GLB caiba na composição. */}
      <Bounds fit clip observe margin={1.1}>
        <Center>
          <group ref={group}>
            <primitive object={model} />
          </group>
        </Center>
      </Bounds>
    </Float>
  );
}

/** Avião procedural (fallback quando não há .glb). */
function ProceduralPlane({ autoRotate }: { autoRotate: boolean }) {
  const group = useRef<THREE.Group>(null);
  useIdleSpin(group, autoRotate);

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

  return (
    <Float speed={autoRotate ? 1.2 : 0} rotationIntensity={0} floatIntensity={autoRotate ? 0.4 : 0}>
      <group ref={group} scale={0.62}>
        <mesh material={matFuselage} rotation={[0, 0, Math.PI / 2]} castShadow>
          <capsuleGeometry args={[0.34, 3.6, 16, 28]} />
        </mesh>
        <mesh material={matFuselage} position={[2.08, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.33, 0.6, 28]} />
        </mesh>
        <mesh material={matGlass} position={[1.78, 0.14, 0]} scale={[1.1, 0.7, 0.9]}>
          <sphereGeometry args={[0.26, 20, 16]} />
        </mesh>
        <mesh material={matAccentTeal} rotation={[0, 0, Math.PI / 2]} position={[0, 0.16, 0]}>
          <cylinderGeometry args={[0.345, 0.345, 3.4, 28, 1, true, 0, Math.PI * 0.6]} />
        </mesh>
        <group position={[-0.1, -0.22, 0]}>
          <mesh material={matWing} position={[-0.35, 0.02, 1.25]} rotation={[0.07, -0.6, 0]} castShadow>
            <boxGeometry args={[1.5, 0.07, 0.95]} />
          </mesh>
          <mesh material={matWing} position={[-0.35, 0.02, -1.25]} rotation={[-0.07, 0.6, 0]} castShadow>
            <boxGeometry args={[1.5, 0.07, 0.95]} />
          </mesh>
          <mesh material={matAccentTeal} position={[-1.05, 0.14, 2.0]} rotation={[0, -0.6, 0.5]}>
            <boxGeometry args={[0.5, 0.26, 0.05]} />
          </mesh>
          <mesh material={matAccentTeal} position={[-1.05, 0.14, -2.0]} rotation={[0, 0.6, -0.5]}>
            <boxGeometry args={[0.5, 0.26, 0.05]} />
          </mesh>
        </group>
        <group position={[0.1, -0.42, 0]}>
          <mesh material={matTurbine} position={[0, 0, 1.0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.17, 0.19, 0.78, 20]} />
          </mesh>
          <mesh material={matTurbine} position={[0, 0, -1.0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.17, 0.19, 0.78, 20]} />
          </mesh>
          <mesh material={matFuselage} position={[-0.1, 0.2, 1.0]}>
            <boxGeometry args={[0.5, 0.22, 0.06]} />
          </mesh>
          <mesh material={matFuselage} position={[-0.1, 0.2, -1.0]}>
            <boxGeometry args={[0.5, 0.22, 0.06]} />
          </mesh>
        </group>
        <group position={[-1.95, 0.08, 0]}>
          <mesh material={matWing} position={[-0.1, 0, 0.5]} rotation={[0.05, -0.5, 0]} castShadow>
            <boxGeometry args={[0.72, 0.05, 0.5]} />
          </mesh>
          <mesh material={matWing} position={[-0.1, 0, -0.5]} rotation={[-0.05, 0.5, 0]} castShadow>
            <boxGeometry args={[0.72, 0.05, 0.5]} />
          </mesh>
          <mesh material={matAccentTeal} position={[-0.25, 0.62, 0]} rotation={[0, 0, 0.42]} castShadow>
            <boxGeometry args={[0.85, 0.78, 0.06]} />
          </mesh>
        </group>
      </group>
    </Float>
  );
}

/**
 * ErrorBoundary local da cena 3D: se o carregamento do GLB falhar (arquivo
 * ausente ou inválido), renderiza o avião procedural no lugar — garantindo que
 * SEMPRE haja um avião 3D girável, com ou sem o arquivo .glb.
 */
class ModelBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { erro: boolean }
> {
  state = { erro: false };
  static getDerivedStateFromError() {
    return { erro: true };
  }
  render() {
    return this.state.erro ? this.props.fallback : this.props.children;
  }
}

export function PlaneScene() {
  const [interagindo, setInteragindo] = useState(false);

  const prefersReduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const autoRotate = !interagindo && !prefersReduced;

  return (
    <Canvas
      camera={{ position: [3.0, 1.5, 3.8], fov: 40 }}
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent", cursor: interagindo ? "grabbing" : "grab" }}
      onPointerDown={() => setInteragindo(true)}
      onPointerUp={() => setInteragindo(false)}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 6, 4]} intensity={2.1} castShadow />
      <directionalLight position={[-4, 2, -3]} intensity={0.8} color={BRAND_WARM} />
      <directionalLight position={[0, -3, 2]} intensity={0.5} color={BRAND_TEAL} />
      <Environment preset="city" />

      <ModelBoundary fallback={<ProceduralPlane autoRotate={autoRotate} />}>
        <Suspense fallback={<ProceduralPlane autoRotate={autoRotate} />}>
          <GltfPlane autoRotate={autoRotate} />
        </Suspense>
      </ModelBoundary>

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

// Pré-carrega o modelo (com Draco) para acelerar a primeira exibição.
useGLTF.preload(MODEL_URL, true);
