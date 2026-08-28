import type { Metadata } from 'next';
import FounderHero from './components/FounderHero';
import FounderIntroduction from './components/FounderIntroduction';
import FounderImpact from './components/FounderImpact';
import FounderMedia from './components/FounderMedia';
import FounderJourney from './components/FounderJourney';
import FounderPhilosophy from './components/FounderPhilosophy';
import FounderVision from './components/FounderVision';
import FounderMessage from './components/FounderMessage';
import FounderCTA from './components/FounderCTA';
import Footer from '@/app/components/Footer';
import { JsonLd } from '@/components/seo/JsonLd';

export const metadata: Metadata = {
  title: 'Mr. Aarushh Sahu — Founder & President | SMJMUN',
  description: 'Discover the journey, leadership philosophy, and vision of Mr. Aarushh Sahu, Founder & President of SMJMUN.',
  alternates: {
    canonical: 'https://smjmun.com/founder',
  },
  openGraph: {
    title: 'Mr. Aarushh Sahu — Founder & President | SMJMUN',
    description: 'Discover the journey, leadership philosophy, and vision of Mr. Aarushh Sahu, Founder & President of SMJMUN.',
    url: 'https://smjmun.com/founder',
    type: 'profile',
    images: [
      {
        url: 'https://smjmun.com/images/founder-2.jpeg',
        width: 800,
        height: 800,
        alt: 'Mr. Aarushh Sahu',
      },
    ],
  },
};

export default function FounderPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: 'Mr. Aarushh Sahu',
    jobTitle: 'Founder & President',
    image: 'https://smjmun.com/images/founder-2.jpeg',
    worksFor: {
      '@type': 'Organization',
      name: 'SMJMUN',
      url: 'https://smjmun.com',
    },
    sameAs: [
      'https://www.linkedin.com/in/theaarushsahu',
      'https://www.instagram.com/theaarushhsahu?igsh=MXR6amRrYndvNnNvOA=='
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <main className="bg-[#0A0A0A] min-h-screen">
        <FounderHero />
        <FounderIntroduction />
        <FounderImpact />
        <FounderMedia />
        <FounderJourney />
        <FounderPhilosophy />
        <FounderVision />
        <FounderMessage />
        <FounderCTA />
      </main>
      <Footer />
    </>
  );
}
