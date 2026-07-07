"use client";

import React, { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

interface ThreeBackgroundProps {
  scrollProgressRef: React.MutableRefObject<number>;
  isMobile: boolean;
}

// Simple frame-rate independent damp function
function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

function CodebaseScene({ scrollProgressRef, isMobile }: ThreeBackgroundProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);

  const mouseRef = useRef({ x: 0, y: 0 });
  const currentScrollRef = useRef(0);
  const currentMouseRef = useRef({ x: 0, y: 0 });

  const particleCount = isMobile ? 100 : 300;

  // Track mouse coordinates
  useEffect(() => {
    if (isMobile) return;
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isMobile]);

  // Generate node positions for different states
  const { hero, problem, solution, cta, connections } = useMemo(() => {
    const count = particleCount;
    const heroPos = new Float32Array(count * 3);
    const problemPos = new Float32Array(count * 3);
    const solutionPos = new Float32Array(count * 3);
    const ctaPos = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // 1. Hero: Sparse, calm sphere
      const rHero = 8 + Math.random() * 6;
      const thetaHero = Math.random() * Math.PI * 2;
      const phiHero = Math.acos(2 * Math.random() - 1);
      heroPos[i * 3] = rHero * Math.sin(phiHero) * Math.cos(thetaHero);
      heroPos[i * 3 + 1] = rHero * Math.sin(phiHero) * Math.sin(thetaHero);
      heroPos[i * 3 + 2] = rHero * Math.cos(phiHero);

      // 2. Problem: Chaotic, clustered, tangled dependencies
      const cluster = i % 3;
      let cx = 0, cy = 0, cz = 0;
      if (cluster === 0) { cx = -4; cy = 3; cz = -2; }
      else if (cluster === 1) { cx = 5; cy = -3; cz = 3; }
      else { cx = -2; cy = -4; cz = -4; }
      problemPos[i * 3] = cx + (Math.random() - 0.5) * 8;
      problemPos[i * 3 + 1] = cy + (Math.random() - 0.5) * 8;
      problemPos[i * 3 + 2] = cz + (Math.random() - 0.5) * 8;

      // 3. Solution: Structured hierarchical tree network
      const layer = i % 5; // 5 vertical tiers
      const layerCount = count / 5;
      const indexInLayer = Math.floor(i / 5);
      const angle = (indexInLayer / layerCount) * Math.PI * 2;
      const radius = 2 + layer * 1.6;
      solutionPos[i * 3] = radius * Math.cos(angle);
      solutionPos[i * 3 + 1] = (layer - 2) * 2.2;
      solutionPos[i * 3 + 2] = radius * Math.sin(angle);

      // 4. CTA: Resolved, neat, slightly condensed
      ctaPos[i * 3] = solutionPos[i * 3] * 0.75;
      ctaPos[i * 3 + 1] = solutionPos[i * 3 + 1] * 0.75;
      ctaPos[i * 3 + 2] = solutionPos[i * 3 + 2] * 0.75;
    }

    // Generate connections between nearby nodes or layered nodes
    const connPairs: [number, number][] = [];
    for (let i = 0; i < count; i++) {
      // Connect to next index to form chains
      if (i < count - 1 && Math.random() > 0.4) {
        connPairs.push([i, i + 1]);
      }
      // Connect across layers/branches
      if (i < count - 10 && Math.random() > 0.8) {
        connPairs.push([i, i + 10]);
      }
    }

    return { hero: heroPos, problem: problemPos, solution: solutionPos, cta: ctaPos, connections: connPairs };
  }, [particleCount]);

  // Pre-allocate temporary arrays for frame updates
  const tempPos = useMemo(() => new Float32Array(particleCount * 3), [particleCount]);
  const linePos = useMemo(() => new Float32Array(connections.length * 2 * 3), [connections, particleCount]);

  // Ambience colors for nodes
  const colors = useMemo(() => {
    const count = particleCount;
    const colorArray = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Warm tones for some, cool electric blue/teal for others
      if (i % 3 === 0) {
        colorArray[i * 3] = 0.23;     // R: 59/255 (Electric Blue)
        colorArray[i * 3 + 1] = 0.51; // G: 130/255
        colorArray[i * 3 + 2] = 0.96; // B: 246/255
      } else if (i % 3 === 1) {
        colorArray[i * 3] = 0.06;     // R: 14/255 (Teal)
        colorArray[i * 3 + 1] = 0.81; // G: 206/255
        colorArray[i * 3 + 2] = 0.71; // B: 181/255
      } else {
        colorArray[i * 3] = 0.93;     // R: 239/255 (Accent Rose/Amber)
        colorArray[i * 3 + 1] = 0.49; // G: 125/255
        colorArray[i * 3 + 2] = 0.32; // B: 82/255
      }
    }
    return colorArray;
  }, [particleCount]);

  useFrame((state, delta) => {
    // Smooth the scroll input with damping
    const targetScroll = scrollProgressRef.current;
    currentScrollRef.current = damp(currentScrollRef.current, targetScroll, 3, delta);

    const s = currentScrollRef.current;

    // Interpolate positions based on scroll
    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;
      let x = 0, y = 0, z = 0;

      if (s < 0.25) {
        const t = s / 0.25;
        x = THREE.MathUtils.lerp(hero[idx], problem[idx], t);
        y = THREE.MathUtils.lerp(hero[idx + 1], problem[idx + 1], t);
        z = THREE.MathUtils.lerp(hero[idx + 2], problem[idx + 2], t);
      } else if (s < 0.65) {
        const t = (s - 0.25) / 0.4;
        x = THREE.MathUtils.lerp(problem[idx], solution[idx], t);
        y = THREE.MathUtils.lerp(problem[idx + 1], solution[idx + 1], t);
        z = THREE.MathUtils.lerp(problem[idx + 2], solution[idx + 2], t);
      } else {
        const t = (s - 0.65) / 0.35;
        x = THREE.MathUtils.lerp(solution[idx], cta[idx], t);
        y = THREE.MathUtils.lerp(solution[idx + 1], cta[idx + 1], t);
        z = THREE.MathUtils.lerp(solution[idx + 2], cta[idx + 2], t);
      }

      tempPos[idx] = x;
      tempPos[idx + 1] = y;
      tempPos[idx + 2] = z;
    }

    // Update node positions
    if (pointsRef.current) {
      const geo = pointsRef.current.geometry;
      geo.setAttribute("position", new THREE.BufferAttribute(tempPos, 3));
      geo.attributes.position.needsUpdate = true;
    }

    // Update connecting line positions
    for (let k = 0; k < connections.length; k++) {
      const [i1, i2] = connections[k];
      const lineIdx = k * 6;

      linePos[lineIdx] = tempPos[i1 * 3];
      linePos[lineIdx + 1] = tempPos[i1 * 3 + 1];
      linePos[lineIdx + 2] = tempPos[i1 * 3 + 2];

      linePos[lineIdx + 3] = tempPos[i2 * 3];
      linePos[lineIdx + 4] = tempPos[i2 * 3 + 1];
      linePos[lineIdx + 5] = tempPos[i2 * 3 + 2];
    }

    if (linesRef.current) {
      const geo = linesRef.current.geometry;
      geo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
      geo.attributes.position.needsUpdate = true;
    }

    // Continuous slow ambient rotation/drift
    const driftSpeed = 0.05;
    const time = state.clock.getElapsedTime();
    if (pointsRef.current) {
      pointsRef.current.rotation.y = time * driftSpeed;
      pointsRef.current.rotation.x = Math.sin(time * 0.2) * 0.05;
    }
    if (linesRef.current) {
      linesRef.current.rotation.y = time * driftSpeed;
      linesRef.current.rotation.x = Math.sin(time * 0.2) * 0.05;
    }

    // Camera mouse parallax (smoothly damped, disabled on mobile)
    if (!isMobile) {
      currentMouseRef.current.x = damp(currentMouseRef.current.x, mouseRef.current.x, 2, delta);
      currentMouseRef.current.y = damp(currentMouseRef.current.y, mouseRef.current.y, 2, delta);

      state.camera.position.x = currentMouseRef.current.x * 2.5;
      state.camera.position.y = currentMouseRef.current.y * 2.5;
    }

    // Camera depth/distance interpolation based on scroll
    let targetZ = 18;
    if (s < 0.25) {
      targetZ = THREE.MathUtils.lerp(18, 14, s / 0.25);
    } else if (s < 0.65) {
      targetZ = THREE.MathUtils.lerp(14, 16, (s - 0.25) / 0.4);
    } else {
      targetZ = THREE.MathUtils.lerp(16, 15, (s - 0.65) / 0.35);
    }
    state.camera.position.z = damp(state.camera.position.z, targetZ, 3, delta);
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <group>
      {/* Code Nodes */}
      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(particleCount * 3), 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colors, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={isMobile ? 0.15 : 0.2}
          vertexColors
          transparent
          opacity={0.8}
          sizeAttenuation
        />
      </points>

      {/* Code Connection Lines */}
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(connections.length * 2 * 3), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          color="#3b82f6"
          transparent
          opacity={isMobile ? 0.08 : 0.15}
          linewidth={1}
        />
      </lineSegments>
    </group>
  );
}

export default function ThreeBackground({ scrollProgressRef, isMobile }: ThreeBackgroundProps) {
  return (
    <div className="absolute inset-0 w-full h-full select-none pointer-events-none">
      <Canvas
        camera={{ position: [0, 0, 18], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        dpr={typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[10, 10, 10]} intensity={1.5} />
        <CodebaseScene scrollProgressRef={scrollProgressRef} isMobile={isMobile} />

        {/* Premium Glow / Post-processing Bloom (reduced on mobile) */}
        <EffectComposer enabled={!isMobile}>
          <Bloom
            intensity={1.2}
            luminanceThreshold={0.15}
            luminanceSmoothing={0.9}
            height={300}
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
