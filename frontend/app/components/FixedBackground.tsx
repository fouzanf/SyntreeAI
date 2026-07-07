"use client";

import React, { useState, useEffect, useRef } from "react";
import { useScroll, useTransform, motion, useMotionValueEvent } from "framer-motion";
import dynamic from "next/dynamic";

// Dynamic import of ThreeBackground with SSR disabled
const ThreeBackground = dynamic(() => import("./ThreeBackground"), {
  ssr: false,
  loading: () => null,
});

// Error boundary to fall back to the original CSS gradient design if WebGL fails
class WebGLErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("WebGL Background crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export default function FixedBackground() {
  const { scrollYProgress } = useScroll();
  const scrollProgressRef = useRef(0);

  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);

  // Monitor scroll progression and update Ref without triggering React re-renders
  useMotionValueEvent(scrollYProgress, "change", (latest) => {
    scrollProgressRef.current = latest;
  });

  useEffect(() => {
    // Detect prefers-reduced-motion
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(motionQuery.matches);
    const motionHandler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    motionQuery.addEventListener("change", motionHandler);

    // Detect mobile viewport (<768px)
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);

    // Pause rendering on tab blur
    const handleVisibility = () => {
      setIsTabVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      motionQuery.removeEventListener("change", motionHandler);
      window.removeEventListener("resize", checkMobile);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  // Interpolate container background color smoothly across scroll progression
  const bgColor = useTransform(
    scrollYProgress,
    [0, 0.25, 0.55, 0.8, 1],
    ["#0A0A0B", "#160D0D", "#0B132B", "#060814", "#04050A"]
  );

  // Background overlays for static fallback
  const gridOpacity = useTransform(
    scrollYProgress,
    [0, 0.25, 0.55, 0.8, 1],
    [0.4, 0.15, 0.35, 0.45, 0.2]
  );

  const warmGlowOpacity = useTransform(
    scrollYProgress,
    [0.1, 0.25, 0.45, 0.55],
    [0, 0.7, 0.6, 0]
  );

  const graphGlowOpacity = useTransform(
    scrollYProgress,
    [0.4, 0.55, 0.75, 0.85],
    [0, 0.8, 0.7, 0]
  );

  const ctaGlowOpacity = useTransform(
    scrollYProgress,
    [0.75, 0.85, 1],
    [0, 0.6, 0.9]
  );

  // Fallback CSS Gradient + SVGs (used on prefers-reduced-motion, WebGL crash, or mobile backup)
  const FallbackUI = (
    <div className="absolute inset-0 w-full h-full">
      {/* 2. Problem Section Warm Glow (Red/Amber) */}
      <motion.div
        style={{ opacity: warmGlowOpacity }}
        className="absolute inset-0 pointer-events-none will-change-opacity"
        aria-hidden="true"
      >
        <div
          className="absolute top-1/4 left-1/4 w-[600px] h-[600px] rounded-full blur-[180px] bg-red-950/20"
          style={{ mixBlendMode: "screen" }}
        />
        <div
          className="absolute top-1/3 right-1/4 w-[500px] h-[500px] rounded-full blur-[150px] bg-amber-950/15"
          style={{ mixBlendMode: "screen" }}
        />
      </motion.div>

      {/* 3. Solution Section Network Graph & Connection Lines */}
      <motion.div
        style={{ opacity: graphGlowOpacity }}
        className="absolute inset-0 pointer-events-none will-change-opacity"
        aria-hidden="true"
      >
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[200px] bg-blue-950/30"
          style={{ mixBlendMode: "screen" }}
        />
        <svg className="absolute inset-0 w-full h-full stroke-blue-500/20" fill="none">
          <motion.path
            d="M 15% 30% L 35% 45% L 50% 35% L 70% 55% L 85% 40%"
            strokeWidth="1.5"
            strokeDasharray="8 6"
            animate={{ strokeDashoffset: -100 }}
            transition={{ repeat: Infinity, duration: 20, ease: "linear" }}
          />
          <motion.path
            d="M 25% 65% L 40% 50% L 60% 70% L 75% 50%"
            strokeWidth="1.5"
            strokeDasharray="6 8"
            animate={{ strokeDashoffset: 100 }}
            transition={{ repeat: Infinity, duration: 15, ease: "linear" }}
          />
          <motion.path
            d="M 50% 35% L 60% 70%"
            strokeWidth="1"
            strokeDasharray="4 4"
            animate={{ strokeDashoffset: -50 }}
            transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
          />
          <motion.path
            d="M 35% 45% L 40% 50%"
            strokeWidth="1"
            strokeDasharray="4 4"
            animate={{ strokeDashoffset: 50 }}
            transition={{ repeat: Infinity, duration: 8, ease: "linear" }}
          />
          <circle cx="15%" cy="30%" r="4" className="fill-blue-500/40 animate-pulse" />
          <circle cx="35%" cy="45%" r="6" className="fill-blue-400/50 animate-pulse" />
          <circle cx="50%" cy="35%" r="5" className="fill-blue-500/40 animate-pulse" />
          <circle cx="70%" cy="55%" r="6" className="fill-blue-400/50 animate-pulse" />
          <circle cx="85%" cy="40%" r="4" className="fill-blue-500/40 animate-pulse" />
          <circle cx="25%" cy="65%" r="5" className="fill-blue-500/40 animate-pulse" />
          <circle cx="40%" cy="50%" r="7" className="fill-blue-400/60 animate-pulse" />
          <circle cx="60%" cy="70%" r="6" className="fill-blue-500/40 animate-pulse" />
          <circle cx="75%" cy="50%" r="5" className="fill-blue-500/40 animate-pulse" />
        </svg>
      </motion.div>

      {/* 4. Final CTA Section Glow */}
      <motion.div
        style={{ opacity: ctaGlowOpacity }}
        className="absolute inset-0 pointer-events-none will-change-opacity"
        aria-hidden="true"
      >
        <div className="absolute bottom-0 left-0 right-0 h-[80vh] bg-gradient-to-t from-blue-950/25 via-blue-950/5 to-transparent" />
        <div
          className="absolute bottom-[-100px] left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full blur-[180px] bg-blue-900/20"
          style={{ mixBlendMode: "screen" }}
        />
      </motion.div>
    </div>
  );

  return (
    <motion.div
      style={{ backgroundColor: bgColor }}
      className="fixed inset-0 w-full h-full -z-50 overflow-hidden select-none pointer-events-none transition-colors duration-500 ease-out will-change-transform"
    >
      {/* 1. Hero Grid Overlay (Always present for structure) */}
      <motion.div
        style={{ opacity: gridOpacity }}
        className="absolute inset-0 grid-bg animate-grid-fade will-change-opacity"
      />
      <div className="absolute inset-0 glow-overlay" />

      {/* Dynamically render 3D WebGL scenes, or Fallback gradient UI */}
      {!prefersReducedMotion && isTabVisible ? (
        <WebGLErrorBoundary fallback={FallbackUI}>
          <ThreeBackground scrollProgressRef={scrollProgressRef} isMobile={isMobile} />
        </WebGLErrorBoundary>
      ) : (
        FallbackUI
      )}
    </motion.div>
  );
}
