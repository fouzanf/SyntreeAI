import FixedBackground from "./components/FixedBackground";
import HeroSection from "./components/HeroSection";
import ProblemSection from "./components/ProblemSection";
import HowItWorks from "./components/HowItWorks";
import FeatureShowcase from "./components/FeatureShowcase";
import TechStackStrip from "./components/TechStackStrip";
import CTASection from "./components/CTASection";
import Footer from "./components/Footer";

export default function Home() {
  return (
    <>
      {/* Scroll-driven fixed background layer */}
      <FixedBackground />

      {/* Main scrolling layout */}
      <main className="relative w-full min-h-screen z-10 flex flex-col">
        <HeroSection />
        <ProblemSection />
        <HowItWorks />
        <FeatureShowcase />
        <TechStackStrip />
        <CTASection />
        <Footer />
      </main>
    </>
  );
}
