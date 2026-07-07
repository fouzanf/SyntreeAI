"use client";

import React, { useRef, useMemo, useEffect, useState, Component, ErrorInfo, ReactNode } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

// --- TYPES ---
export type AppBackgroundState = "ingest" | "loading" | "chat" | "streaming";

interface AppBackgroundProps {
  appState: AppBackgroundState;
}

// --- ERROR BOUNDARY FOR WEBGL FALLBACK ---
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class WebGLErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false
  };

  public static getDerivedStateFromError(_: Error): ErrorBoundaryState {
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("WebGL Error Boundary caught an exception:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      console.log("WebGL failed, showing fallback");
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// --- UTILITIES ---
function damp(current: number, target: number, lambda: number, dt: number) {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}

// --- 3D SCENE INNER COMPONENT ---
interface SceneProps {
  appState: AppBackgroundState;
  isMobile: boolean;
  prefersReducedMotion: boolean;
}

function AppScene({ appState, isMobile, prefersReducedMotion }: SceneProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const linesRef = useRef<THREE.LineSegments>(null);

  const mouseRef = useRef({ x: 0, y: 0 });
  const currentMouseRef = useRef({ x: 0, y: 0 });

  // Dynamic state interpolation values
  const currentSpeed = useRef(0.05);
  const currentConnectionDist = useRef(2.0);
  const currentColorMix = useRef(0.0);
  const currentRippleTime = useRef(0.0);
  const currentRippleIntensity = useRef(0.0);

  const particleCount = isMobile ? 80 : 300;

  // Track mouse coordinates for parallax
  useEffect(() => {
    if (isMobile || prefersReducedMotion) return;
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouseRef.current.y = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [isMobile, prefersReducedMotion]);

  // Generate initial particle positions, velocities, and base colors
  const particles = useMemo(() => {
    const pos = new Float32Array(particleCount * 3);
    const vel = new Float32Array(particleCount * 3);
    const color = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount; i++) {
      // Position particles inside a sphere of radius 3 to 12
      const r = 3.0 + Math.random() * 9.0;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);

      // Slow velocities for continuous drift
      const speedScale = 0.05;
      vel[i * 3] = (Math.random() - 0.5) * speedScale;
      vel[i * 3 + 1] = (Math.random() - 0.5) * speedScale;
      vel[i * 3 + 2] = (Math.random() - 0.5) * speedScale;

      // Base color mix (mix of Blue #3B82F6 and Cyan #06B6D4)
      // Blue: R=0.23, G=0.51, B=0.96
      // Cyan: R=0.02, G=0.71, B=0.83
      const isBlue = Math.random() > 0.4;
      if (isBlue) {
        color[i * 3] = 0.23;
        color[i * 3 + 1] = 0.51;
        color[i * 3 + 2] = 0.96;
      } else {
        color[i * 3] = 0.02;
        color[i * 3 + 1] = 0.71;
        color[i * 3 + 2] = 0.83;
      }
    }

    return { pos, vel, color };
  }, [particleCount]);

  // Pre-allocate arrays for line positions and colors
  const maxConnections = isMobile ? 80 : 250;
  const linePos = useMemo(() => new Float32Array(maxConnections * 2 * 3), [maxConnections]);
  const lineColors = useMemo(() => new Float32Array(maxConnections * 2 * 3), [maxConnections]);

  useFrame((state, delta) => {
    // 1. Determine targets based on appState
    let targetSpeed = 0.05;
    let targetDist = 2.0;
    let targetColorMix = 0.0;
    let targetRipple = 0.0;

    if (appState === "loading") {
      targetSpeed = 0.25;
      targetDist = 3.5;
      targetColorMix = 0.3;
    } else if (appState === "chat") {
      targetSpeed = 0.08;
      targetDist = 2.4;
      targetColorMix = 0.9; // Cyan dominant
    } else if (appState === "streaming") {
      targetSpeed = 0.12;
      targetDist = 2.6;
      targetColorMix = 0.7;
      targetRipple = 1.0; // Trigger active brightness ripple
    }

    // Apply prefers-reduced-motion overrides
    if (prefersReducedMotion) {
      targetSpeed = 0.0;
      targetRipple = 0.0;
    }

    // 2. Damp configuration values
    currentSpeed.current = damp(currentSpeed.current, targetSpeed, 2.0, delta);
    currentConnectionDist.current = damp(currentConnectionDist.current, targetDist, 2.0, delta);
    currentColorMix.current = damp(currentColorMix.current, targetColorMix, 2.0, delta);
    currentRippleIntensity.current = damp(currentRippleIntensity.current, targetRipple, 2.5, delta);

    // 3. Ripple wavefront updates
    const maxRippleDist = 12.0;
    if (currentRippleIntensity.current > 0.01) {
      currentRippleTime.current += delta * 4.0;
      if (currentRippleTime.current > maxRippleDist) {
        currentRippleTime.current = 0.0;
      }
    } else {
      currentRippleTime.current = 0.0;
    }

    // 4. Update particle positions and colors
    if (!pointsRef.current) return;
    const posAttr = pointsRef.current.geometry.attributes.position.array as Float32Array;
    const colorAttr = pointsRef.current.geometry.attributes.color.array as Float32Array;

    for (let i = 0; i < particleCount; i++) {
      const idx = i * 3;

      let px = particles.pos[idx];
      let py = particles.pos[idx + 1];
      let pz = particles.pos[idx + 2];

      if (!prefersReducedMotion) {
        px += particles.vel[idx] * currentSpeed.current * delta * 60;
        py += particles.vel[idx + 1] * currentSpeed.current * delta * 60;
        pz += particles.vel[idx + 2] * currentSpeed.current * delta * 60;

        // Bounce back if drifting too far from center
        const dist = Math.sqrt(px * px + py * py + pz * pz);
        if (dist > 12.0) {
          particles.vel[idx] *= -1;
          particles.vel[idx + 1] *= -1;
          particles.vel[idx + 2] *= -1;
        }

        particles.pos[idx] = px;
        particles.pos[idx + 1] = py;
        particles.pos[idx + 2] = pz;
      }

      posAttr[idx] = px;
      posAttr[idx + 1] = py;
      posAttr[idx + 2] = pz;

      // Color interpolation: blue to cyan
      const baseR = particles.color[idx];
      const baseG = particles.color[idx + 1];
      const baseB = particles.color[idx + 2];

      // Interpolate towards pure cyan (#06B6D4)
      let targetR = THREE.MathUtils.lerp(baseR, 0.02, currentColorMix.current);
      let targetG = THREE.MathUtils.lerp(baseG, 0.71, currentColorMix.current);
      let targetB = THREE.MathUtils.lerp(baseB, 0.83, currentColorMix.current);

      // Ripple brightness boost
      let rippleBoost = 0.0;
      if (currentRippleIntensity.current > 0.01) {
        const d = Math.sqrt(px * px + py * py + pz * pz);
        const distFromWave = Math.abs(d - currentRippleTime.current);
        if (distFromWave < 2.0) {
          const fadeFactor = Math.max(0, 1.0 - currentRippleTime.current / maxRippleDist);
          rippleBoost = (1.0 - distFromWave / 2.0) * currentRippleIntensity.current * fadeFactor * 0.8;
        }
      }

      colorAttr[idx] = Math.min(1.0, targetR + rippleBoost);
      colorAttr[idx + 1] = Math.min(1.0, targetG + rippleBoost);
      colorAttr[idx + 2] = Math.min(1.0, targetB + rippleBoost);
    }

    pointsRef.current.geometry.attributes.position.needsUpdate = true;
    pointsRef.current.geometry.attributes.color.needsUpdate = true;

    // 5. Connect nearby particles dynamically (plexus lines)
    let lineIdx = 0;
    const threshold = currentConnectionDist.current;

    for (let i = 0; i < particleCount; i++) {
      if (lineIdx >= maxConnections) break;
      const xi = posAttr[i * 3];
      const yi = posAttr[i * 3 + 1];
      const zi = posAttr[i * 3 + 2];

      for (let j = i + 1; j < particleCount; j++) {
        if (lineIdx >= maxConnections) break;
        const xj = posAttr[j * 3];
        const yj = posAttr[j * 3 + 1];
        const zj = posAttr[j * 3 + 2];

        const dx = xi - xj;
        const dy = yi - yj;
        const dz = zi - zj;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq < threshold * threshold) {
          const dist = Math.sqrt(distSq);
          const intensity = (1.0 - dist / threshold) * 0.25;

          // Vertex 1
          linePos[lineIdx * 6] = xi;
          linePos[lineIdx * 6 + 1] = yi;
          linePos[lineIdx * 6 + 2] = zi;

          // Vertex 2
          linePos[lineIdx * 6 + 3] = xj;
          linePos[lineIdx * 6 + 4] = yj;
          linePos[lineIdx * 6 + 5] = zj;

          // Fade colors towards background as they get further apart
          const r = THREE.MathUtils.lerp(0.23, 0.02, currentColorMix.current) * intensity;
          const g = THREE.MathUtils.lerp(0.51, 0.71, currentColorMix.current) * intensity;
          const b = THREE.MathUtils.lerp(0.96, 0.83, currentColorMix.current) * intensity;

          lineColors[lineIdx * 6] = r;
          lineColors[lineIdx * 6 + 1] = g;
          lineColors[lineIdx * 6 + 2] = b;
          lineColors[lineIdx * 6 + 3] = r;
          lineColors[lineIdx * 6 + 4] = g;
          lineColors[lineIdx * 6 + 5] = b;

          lineIdx++;
        }
      }
    }

    if (linesRef.current) {
      const geo = linesRef.current.geometry;
      geo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(lineColors, 3));
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      geo.setDrawRange(0, lineIdx * 2);
    }

    // 6. Slowly rotate the system
    const rotationSpeed = 0.015;
    const time = state.clock.getElapsedTime();
    if (!prefersReducedMotion) {
      pointsRef.current.rotation.y = time * rotationSpeed;
      if (linesRef.current) {
        linesRef.current.rotation.y = time * rotationSpeed;
      }
    }

    // 7. Mouse parallax (extremely subtle: max 0.02 shifting)
    if (!isMobile && !prefersReducedMotion) {
      currentMouseRef.current.x = damp(currentMouseRef.current.x, mouseRef.current.x, 1.5, delta);
      currentMouseRef.current.y = damp(currentMouseRef.current.y, mouseRef.current.y, 1.5, delta);

      pointsRef.current.position.x = currentMouseRef.current.x * 0.02;
      pointsRef.current.position.y = currentMouseRef.current.y * 0.02;

      if (linesRef.current) {
        linesRef.current.position.x = currentMouseRef.current.x * 0.02;
        linesRef.current.position.y = currentMouseRef.current.y * 0.02;
      }
    }
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
            args={[particles.color, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.08}
          vertexColors
          transparent
          opacity={0.8}
          sizeAttenuation
        />
      </points>

      {/* Code connections */}
      <lineSegments ref={linesRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[new Float32Array(maxConnections * 2 * 3), 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[new Float32Array(maxConnections * 2 * 3), 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial
          vertexColors
          transparent
          opacity={0.2}
          linewidth={1}
        />
      </lineSegments>
    </group>
  );
}

// --- MAIN CANVAS COMPONENT WITH PERFORMANCE TUNING ---
function AppBackgroundCanvas({ appState }: AppBackgroundProps) {
  const [isMobile, setIsMobile] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // 1. Detect screen size
    const checkSize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkSize();
    window.addEventListener("resize", checkSize);

    // 2. Detect prefers-reduced-motion
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);
    const motionListener = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", motionListener);

    return () => {
      window.removeEventListener("resize", checkSize);
      mediaQuery.removeEventListener("change", motionListener);
    };
  }, []);

  return (
    <div className="fixed inset-0 w-full h-full bg-[#0A0A0B] select-none pointer-events-none z-0">
      <Canvas
        camera={{ position: [0, 0, 10], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        dpr={typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.6} />
        <AppScene
          appState={appState}
          isMobile={isMobile}
          prefersReducedMotion={prefersReducedMotion}
        />
        
        {/* Bloom post-processing (disabled on mobile or reduced motion) */}
        {!isMobile && !prefersReducedMotion && (
          <EffectComposer>
            <Bloom
              intensity={0.4}
              luminanceThreshold={0.0}
              luminanceSmoothing={0.9}
              height={300}
            />
          </EffectComposer>
        )}
      </Canvas>
    </div>
  );
}

// --- EXPORT WITH WEBGL ERROR BOUNDARY FALLBACK ---
export default function AppBackground({ appState }: AppBackgroundProps) {
  useEffect(() => {
    console.log("AppBackground mounted");
  }, []);

  return (
    <WebGLErrorBoundary fallback={<div className="fixed inset-0 w-full h-full bg-[#0A0A0B] z-0" />}>
      <AppBackgroundCanvas appState={appState} />
    </WebGLErrorBoundary>
  );
}
