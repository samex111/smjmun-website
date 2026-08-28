'use client';

import React from 'react';
import { Reveal } from '@/components/program/shared/Reveal';

export default function FounderIntroduction() {
  return (
    <section id="founder-intro" className="py-24 md:py-32 bg-[#0A0A0A] relative z-20">
      <div className="max-w-[1000px] mx-auto px-6 md:px-12">
        <Reveal>
          <div className="flex items-center gap-4 mb-12">
            <div className="w-12 h-[2px] bg-[#BB8B57]" />
            <span className="text-xs uppercase tracking-[0.15em] text-[#BB8B57]">The Person Behind SMJMUN</span>
          </div>
        </Reveal>

        <div className="space-y-8 text-lg md:text-xl font-light text-white/80 leading-[1.8] md:leading-[2]">
          <Reveal delay={0.1}>
            <p>
              Mr. Aarushh Sahu is the <strong className="font-medium text-white">Founder and President of SMJMUN</strong> and a passionate advocate for experiential youth education and leadership development.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <p>
              At 22, his work in youth leadership has been recognised with the <strong className="font-medium text-white">&ldquo;Global Youth Leadership Visionary of the Year&rdquo;</strong> award at the <strong className="font-medium text-white">Global Icon Awards 2026</strong>, held in New Delhi on 22 August 2026. Through SMJMUN and his wider initiatives, he has trained and empowered <strong className="font-medium text-white">11,000+ students</strong>, creating opportunities for young people to develop leadership, communication, diplomacy and confidence.
            </p>
          </Reveal>
          <Reveal delay={0.3}>
            <p>
              His journey with Model United Nations began as a delegate. What started as participation gradually became a deeper pursuit of understanding &mdash; of international affairs, public policy, structured debate, negotiation and leadership.
            </p>
          </Reveal>
          <Reveal delay={0.4}>
            <p>
              Over the years, Mr. Aarushh Sahu participated in <strong className="font-medium text-white">70+ national and 10+ international Model United Nations conferences</strong>, earning <strong className="font-medium text-white">55+ Best Delegate awards</strong> and serving on the Executive Board of <strong className="font-medium text-white">50+ committees</strong>.
            </p>
          </Reveal>
          <Reveal delay={0.5}>
            <p>
              The experience eventually moved beyond competition. As an Executive Board member and trainer, he began working with younger delegates and observing the difference that structured mentorship could make.
            </p>
          </Reveal>
          <Reveal delay={0.6}>
            <p>
              That experience changed the question.
              <br/><br/>
              It was no longer simply:
              <br/><br/>
              <em className="text-white/90">&ldquo;How can I become a better delegate?&rdquo;</em>
              <br/><br/>
              It became:
              <br/><br/>
              <em className="text-white/90">&ldquo;How can I create better opportunities for others?&rdquo;</em>
              <br/><br/>
              That question became the foundation of <strong className="font-medium text-white">SMJMUN</strong>.
            </p>
          </Reveal>
          <Reveal delay={0.7}>
            <p>
              Today, Mr. Aarushh Sahu works toward creating platforms where students can develop the <strong className="font-medium text-white">confidence to speak, the discipline to prepare, the curiosity to understand and the courage to lead.</strong>
            </p>
          </Reveal>
          <Reveal delay={0.8}>
            <p>
              His vision for SMJMUN extends beyond conferences. He aims to build long-term relationships with educational institutions and create a stronger ecosystem for <strong className="font-medium text-white">youth leadership, experiential learning and meaningful student development</strong>.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
