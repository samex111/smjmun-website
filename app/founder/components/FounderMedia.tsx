'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { Reveal } from '@/components/program/shared/Reveal';
import { X } from 'lucide-react';

const mediaImages = [
  { src: '/images/award-updated-11.jpeg', alt: 'Global Icon Award 1', position: 'object-top' },
  { src: '/images/award-updated-12.jpeg', alt: 'Global Icon Award 2', position: 'object-top' },
  { src: '/images/award-updated-14.jpeg', alt: 'Global Icon Award 3', position: 'object-top' },
  { src: '/images/award-updated-17.jpeg', alt: 'Global Icon Award 4', position: 'object-top' },
];

export default function FounderMedia() {
  const [selectedImg, setSelectedImg] = useState<typeof mediaImages[0] | null>(null);

  // We duplicate the array to create a seamless scrolling loop
  const scrollImages = [...mediaImages, ...mediaImages];

  return (
    <>
      <section className="py-24 md:py-32 bg-[#0A0A0A] relative z-20 overflow-hidden">
        <div className="max-w-[1440px] mx-auto px-6 md:px-12">
        <Reveal>
          <div className="flex items-center gap-4 mb-12">
            <div className="w-12 h-[2px] bg-[#BB8B57]" />
            <span className="text-xs uppercase tracking-[0.15em] text-[#BB8B57]">In the Media</span>
          </div>
        </Reveal>
      </div>

      {/* Infinite Scroll Container */}
      <div className="relative w-full flex overflow-hidden group">
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes infinite-scroll {
            0% { transform: translate3d(0, 0, 0); }
            100% { transform: translate3d(-50%, 0, 0); }
          }
          .animate-infinite-scroll {
            animation: infinite-scroll 40s linear infinite;
            width: max-content;
            will-change: transform;
          }
          /* Pause animation on hover */
          .group:hover .animate-infinite-scroll {
            animation-play-state: paused;
          }
        `}} />
        
        <div className="flex animate-infinite-scroll">
          {scrollImages.map((img, index) => (
            <div key={index} className="px-3 md:px-4">
              <div 
                className="relative w-[280px] h-[350px] md:w-[400px] md:h-[450px] flex-shrink-0 rounded-xl overflow-hidden cursor-pointer group/item"
                onClick={() => setSelectedImg(img)}
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  className={`object-cover transition-transform duration-700 group-hover/item:scale-105 ${img.position || 'object-center'}`}
                  sizes="(max-width: 768px) 300px, 400px"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A]/80 via-transparent to-transparent opacity-60 transition-opacity duration-300 group-hover/item:opacity-0" />
              </div>
            </div>
          ))}
        </div>
      </div>

      </section>

      {/* Lightbox / Modal - Rendered outside section to avoid z-index trapping */}
      {selectedImg && (
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 md:p-8 bg-black/95 backdrop-blur-sm"
          onClick={() => setSelectedImg(null)}
        >
          <button 
            className="absolute top-6 right-6 md:top-8 md:right-8 text-white/70 hover:text-white transition-colors z-10"
            onClick={() => setSelectedImg(null)}
          >
            <X size={36} strokeWidth={1.5} />
          </button>
          
          <div 
            className="relative w-full max-w-5xl h-[80vh] md:h-[90vh]" 
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={selectedImg.src}
              alt={selectedImg.alt}
              fill
              className="object-contain"
              sizes="100vw"
            />
          </div>
        </div>
      )}
    </>
  );
}
