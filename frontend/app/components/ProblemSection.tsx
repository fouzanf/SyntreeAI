"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import { Clock, EyeOff, AlertTriangle } from "lucide-react";

export default function ProblemSection() {
  const cards = [
    {
      icon: <Clock className="w-5 h-5 text-red-400" />,
      title: "Onboarding Lag",
      stat: "3 Weeks",
      desc: "Average developer onboarding time before shipping the first production commit."
    },
    {
      icon: <EyeOff className="w-5 h-5 text-amber-400" />,
      title: "Misunderstood Code",
      stat: "67%",
      desc: "of bugs come from misunderstood code, legacy structures, and side effects."
    },
    {
      icon: <AlertTriangle className="w-5 h-5 text-red-500" />,
      title: "PR Review Latency",
      stat: "2.5 Hours",
      desc: "on average are spent reviewing PRs, halting team velocity."
    }
  ];

  const containerVariants: Variants = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 30 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { 
        type: "spring",
        stiffness: 70,
        damping: 15
      }
    }
  };

  return (
    <section id="problem" className="relative py-28 px-6 max-w-7xl mx-auto z-10">
      <div className="text-center max-w-2xl mx-auto mb-16 space-y-4">
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="text-xs font-mono font-semibold tracking-wider text-red-400 uppercase"
        >
          The Problem
        </motion.div>
        <motion.h2 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-3xl md:text-4xl font-extrabold tracking-tight text-gradient"
        >
          Understanding legacy code is broken
        </motion.h2>
        <motion.p 
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="text-neutral-400 font-sans"
        >
          Modern repositories are massive, interconnected, and dynamic. Traditional 
          regex matching or basic IDE searches fail to capture structural meaning.
        </motion.p>
      </div>

      {/* Grid of pain-point cards */}
      <motion.div 
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-100px" }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
      >
        {cards.map((card, idx) => (
          <motion.div
            key={idx}
            variants={cardVariants}
            whileHover={{ y: -6, borderColor: "rgba(239, 68, 68, 0.2)", boxShadow: "0 10px 30px rgba(220, 38, 38, 0.05)" }}
            className="flex flex-col justify-between p-8 rounded-xl bg-neutral-900/30 backdrop-blur-sm border border-neutral-800/80 transition-all duration-300 relative group overflow-hidden"
          >
            {/* Ambient warm light corner accent */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-red-500/5 to-transparent rounded-bl-full pointer-events-none group-hover:from-red-500/10 transition-all duration-300" />
            
            <div className="space-y-4">
              <div className="inline-flex p-2.5 rounded-lg bg-neutral-950/80 border border-neutral-800">
                {card.icon}
              </div>
              <h3 className="text-base font-semibold text-neutral-300 font-mono tracking-tight">
                {card.title}
              </h3>
            </div>

            <div className="mt-8 space-y-2">
              <div className="text-3xl md:text-4xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-red-200 to-amber-500">
                {card.stat}
              </div>
              <p className="text-sm text-neutral-400 leading-relaxed font-sans">
                {card.desc}
              </p>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
