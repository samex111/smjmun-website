'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { motion, useInView } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const founderImages = [
  '/images/founder-updated-1.webp',
   '/images/founder-updated-8.webp',
  '/images/award-updated-15.jpeg',
  '/images/founder-updated-3.webp',
  '/images/founder-updated-4.webp', 
 

];

const FounderImageSlider = () => {
  const [currentImage, setCurrentImage] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { amount: 0 });

  const SLIDE_DURATION = 2000;

  useEffect(() => {
    if (!isInView) return;
    // Use setTimeout so the timer resets completely when currentImage changes (via manual swipe)
    const timer = setTimeout(() => {
      setCurrentImage((prev) => (prev + 1) % founderImages.length);
    }, SLIDE_DURATION);

    return () => clearTimeout(timer);
  }, [isInView, currentImage]);

  const goToNext = () => setCurrentImage((prev) => (prev + 1) % founderImages.length);
  const goToPrev = () => setCurrentImage((prev) => (prev - 1 + founderImages.length) % founderImages.length);

  return (
    <div ref={ref} className="w-full h-full relative overflow-hidden group">
      {/* Invisible Swipe Overlay */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={(e, { offset }) => {
          const swipe = offset.x;
          const swipeThreshold = 50;
          if (swipe < -swipeThreshold) {
            goToNext();
          } else if (swipe > swipeThreshold) {
            goToPrev();
          }
        }}
        className="absolute inset-0 z-20 cursor-grab active:cursor-grabbing touch-pan-y"
      />

      {/* Background Images with Crossfade */}
      {founderImages.map((src, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            inset: 0,
            opacity: index === currentImage ? 1 : 0,
            transition: 'opacity 1.5s cubic-bezier(0.25, 0.1, 0.25, 1)',
            transform: index === currentImage ? 'scale(1.02)' : 'scale(1)',
          }}
        >
          {src ? (
            <Image
              src={src}
              alt={`Mr. Aarushh Sahu - moment ${index + 1}`}
              fill
              className="object-cover object-top grayscale-[20%] contrast-110"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority={index === 0}
            />
          ) : (
            <div className="w-full h-full bg-[#151515]" />
          )}
        </div>
      ))}

      {/* Navigation Buttons (Visible on Hover/Desktop, or Tap/Mobile) */}
      <div className="absolute inset-y-0 left-4 z-30 flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button
          onClick={(e) => { e.stopPropagation(); goToPrev(); }}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-all pointer-events-auto"
          aria-label="Previous slide"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
      </div>
      <div className="absolute inset-y-0 right-4 z-30 flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <button
          onClick={(e) => { e.stopPropagation(); goToNext(); }}
          className="w-10 h-10 rounded-full bg-black/40 backdrop-blur border border-white/10 flex items-center justify-center text-white/80 hover:text-white hover:bg-black/60 transition-all pointer-events-auto"
          aria-label="Next slide"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Progress Segments — bottom right aligned */}
      <div className="absolute bottom-8 right-8 md:bottom-12 md:right-12 z-30 flex flex-col items-end gap-3 pointer-events-auto">
        <div className="flex items-center gap-2">
          {founderImages.map((_, index) => (
            <div
              key={`progress-${index}`}
              onClick={() => setCurrentImage(index)}
              className="relative h-[2px] w-8 md:w-12 overflow-hidden bg-white/30 cursor-pointer"
            >
              {index === currentImage && (
                <div
                  key={`fill-${currentImage}`}
                  className="absolute left-0 top-0 h-full bg-[#BB8B57]"
                  style={{
                    width: "100%",
                    animation: `fillBar ${SLIDE_DURATION}ms linear forwards`,
                  }}
                />
              )}
              {index < currentImage && (
                <div className="absolute inset-0 bg-[#BB8B57]" />
              )}
            </div>
          ))}
        </div>
        
        {/* Counter */}
        <div className="text-[10px] md:text-xs tracking-[0.25em] text-white/90 font-mono">
          {String(currentImage + 1).padStart(2, "0")} /{" "}
          {String(founderImages.length).padStart(2, "0")}
        </div>
      </div>
    </div>
  );
};

export default function FounderHero() {
  const scrollToNext = () => {
    const nextSection = document.getElementById('founder-intro');
    if (nextSection) {
      nextSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section className="relative min-h-[90vh] md:min-h-screen bg-[#0A0A0A] flex flex-col justify-center overflow-hidden pt-24 md:pt-0">
      <div className="max-w-[1440px] mx-auto px-6 md:px-12 w-full flex flex-col md:flex-row items-center gap-12 md:gap-20">
        
        {/* Left: Text Content */}
        <div className="w-full md:w-1/2 flex flex-col justify-center order-2 md:order-1 z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <span className="block text-[11px] uppercase tracking-[0.2em] text-[#BB8B57] mb-6">
              Founder & President
            </span>
            <h1 
              className="font-[family-name:var(--font-playfair)] font-bold text-white mb-6 leading-tight"
              style={{ fontSize: 'clamp(48px, 6vw, 82px)', letterSpacing: '-0.02em' }}
            >
              Mr. Aarushh Sahu
            </h1>
            <p className="text-lg md:text-xl text-white/80 font-light leading-relaxed max-w-[500px] mb-12">
              Building a generation of confident, informed, and globally minded young leaders.
            </p>
            
            <button 
              onClick={scrollToNext}
              className="group flex items-center gap-3 text-sm uppercase tracking-[0.15em] text-white hover:text-[#BB8B57] transition-colors duration-300"
            >
              <span>Explore His Journey</span>
              <span className="w-8 h-[1px] bg-white/30 group-hover:bg-[#BB8B57] transition-colors duration-300 relative">
                <span className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 border-r border-b border-current -rotate-45 transform translate-x-1/2" />
              </span>
            </button>
          </motion.div>
        </div>

        {/* Right: Editorial Image */}
        <div className="w-full md:w-1/2 h-[50vh] md:h-[80vh] relative order-1 md:order-2 z-10">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            className="w-full h-full relative"
          >
            {/* Editorial Frame */}
            <div className="absolute inset-4 md:inset-8 border border-[#BB8B57]/30 z-20 pointer-events-none" />
            <div className="absolute inset-0 bg-[#BB8B57]/10 z-10 mix-blend-overlay pointer-events-none" />
            
            <FounderImageSlider />
          </motion.div>
        </div>

      </div>

      {/* Subtle background element */}
      <div className="absolute top-1/4 right-1/4 w-[800px] h-[800px] bg-[#397fb7]/5 rounded-full blur-[120px] pointer-events-none" />
    </section>
  );
}
