import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Footer from "@/app/components/Footer";
import { ConferenceService } from "@/lib/sanity/conference/service";
import { urlFor } from "@/lib/sanity/image";
import type { Conference } from "@/lib/sanity/conference/types";

// Components
import ConferenceVideoHero from "./components/ConferenceVideoHero";
import QuickFacts from "./components/QuickFacts";
import ConferenceOverview from "./components/ConferenceOverview";
import CommitteeGrid from "./components/CommitteeGrid";
import ConferenceTimeline from "./components/ConferenceTimeline";
import DelegateExperience from "./components/DelegateExperience";
import GallerySection from "./components/GallerySection";
import VenueSection from "./components/VenueSection";
import FAQSection from "./components/FAQSection";
import RegistrationCTA from "./components/RegistrationCTA";
import ConferenceSidebar from "./components/ConferenceSidebar";

// ─── Static Params ─────────────────────────────────────────────────
export async function generateStaticParams() {
  // CI should verify the app build without relying on a live Sanity dataset.
  // Production builds still pre-render every published CMS slug.
  if (process.env.SKIP_SANITY_STATIC_PARAMS === "true") return [];

  const conferences = await ConferenceService.getConferences();
  return conferences.map((c) => ({ slug: c.slug.current }));
}

// ─── Dynamic Metadata ──────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const conference = await ConferenceService.getConferenceBySlug(slug);

  if (!conference) {
    return { title: "Conference Not Found — SMJ MUN" };
  }

  const title = conference.seoTitle || `${conference.title} — SMJ MUN`;
  const description =
    conference.seoDescription ||
    `${conference.title} at ${conference.venue || "SMJ MUN"}. Join India's premier Model United Nations conference.`;
  const imageUrl = conference.heroImage
    ? urlFor(conference.heroImage).width(1200).height(630).url()
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/conferences/${slug}` },
    openGraph: {
      title,
      description,
      type: "website",
      url: `/conferences/${slug}`,
      ...(imageUrl && { images: [{ url: imageUrl, width: 1200, height: 630 }] }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(imageUrl && { images: [imageUrl] }),
    },
  };
}

import { JsonLd } from "@/components/seo/JsonLd";

// ─── Page ──────────────────────────────────────────────────────────
export default async function ConferenceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const conference = await ConferenceService.getConferenceBySlug(slug);

  if (!conference) notFound();

  const baseUrl = "https://smjmun.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Event",
        name: conference.title,
        description: conference.seoDescription || "Model United Nations Conference",
        startDate: conference.date || new Date().toISOString(),
        endDate: conference.date || new Date().toISOString(),
        eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
        eventStatus: "https://schema.org/EventScheduled",
        location: {
          "@type": "Place",
          name: conference.venue || "TBA",
          address: {
            "@type": "PostalAddress",
            addressCountry: "IN",
          },
        },
        image: conference.heroImage ? urlFor(conference.heroImage).url() : undefined,
        url: `${baseUrl}/conferences/${conference.slug.current}`,
        organizer: {
          "@type": "Organization",
          name: "SMJMUN",
          url: baseUrl,
        },
        offers: {
          "@type": "Offer",
          url: `${baseUrl}/conferences/${conference.slug.current}#register`,
          price: "0",
          priceCurrency: "INR",
          availability: "https://schema.org/InStock",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: baseUrl,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Conferences",
            item: `${baseUrl}/conferences`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: conference.title,
            item: `${baseUrl}/conferences/${conference.slug.current}`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <main style={{ backgroundColor: "#0A0A0A", position: "relative" }}>

        {/* Hero */}
        <ConferenceVideoHero conference={conference} />

        {/* Quick Facts Strip */}
        <QuickFacts conference={conference} />

        {/* Two Column Layout for Desktop */}
        <div className="content-wide" style={{ backgroundColor: '#0A0A0A' }}>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-12 py-12 lg:py-20 relative">

            {/* Main Content Area */}
            <div className="space-y-12">
              <ConferenceOverview conference={conference} />
              <CommitteeGrid conference={conference} />
            </div>

            {/* Sidebar Area
            <div className="hidden lg:block relative">
              <ConferenceSidebar conference={conference} />
            </div> */}

          </div>
        </div>

        {/* Full Width Sections */}
        {/* <ConferenceTimeline conference={conference} /> */}
        <DelegateExperience />
        <GallerySection conference={conference} />
        {/* <VenueSection conference={conference} /> */}
        <FAQSection />

        <RegistrationCTA conference={conference} />
      </main>
      <Footer />
    </>
  );
}
