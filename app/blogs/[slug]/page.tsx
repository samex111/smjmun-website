import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Footer from "@/app/components/Footer";
import { BlogService } from "@/lib/sanity/blog/service";
import { urlFor } from "@/lib/sanity/image";
import type { Blog } from "@/lib/sanity/blog/types";

import ArticleHero from "./components/ArticleHero";
import ArticleCover from "./components/ArticleCover";
import ArticleContent from "./components/ArticleContent";
import AuthorCard from "./components/AuthorCard";
import RelatedArticles from "./components/RelatedArticles";

// ─── Static Params ──────────────────────────────────────────────────────────
export async function generateStaticParams() {
  // CI should verify the app build without relying on a live Sanity dataset.
  // Production builds still pre-render every published CMS slug.
  if (process.env.SKIP_SANITY_STATIC_PARAMS === "true") return [];

  const posts = await BlogService.getBlogPosts();
  return posts.map((p) => ({ slug: p.slug.current }));
}

// ─── Dynamic Metadata ────────────────────────────────────────────────────────
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await BlogService.getBlogPostBySlug(slug);

  if (!post) {
    return { title: "Post Not Found — SMJMUN Journal" };
  }

  const title = post.seoTitle || `${post.title} — SMJMUN Journal`;
  const description =
    post.seoDescription ||
    post.excerpt ||
    `Read "${post.title}" on the SMJMUN Journal.`;
  const imageUrl = post.coverImage
    ? urlFor(post.coverImage).width(1200).height(630).url()
    : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/blogs/${slug}` },
    openGraph: {
      title,
      description,
      type: "article",
      url: `/blogs/${slug}`,
      publishedTime: post.publishedAt,
      authors: post.author ? [post.author] : undefined,
      tags: post.tags,
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

// ─── Page ────────────────────────────────────────────────────────────────────
export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Fetch current post and all posts in parallel
  const [post, allPosts] = await Promise.all([
    BlogService.getBlogPostBySlug(slug),
    BlogService.getBlogPosts(),
  ]);

  if (!post) notFound();

  const coverUrl = post.coverImage
    ? urlFor(post.coverImage).width(1400).height(600).quality(85).url()
    : null;

  const baseUrl = "https://smjmun.com";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: post.title,
        description: post.seoDescription || post.excerpt,
        image: coverUrl || undefined,
        datePublished: post.publishedAt,
        author: post.author
          ? {
              "@type": "Person",
              name: post.author,
            }
          : {
              "@type": "Organization",
              name: "SMJMUN",
            },
        publisher: {
          "@type": "Organization",
          name: "SMJMUN",
          logo: {
            "@type": "ImageObject",
            url: "https://smjmun.com/images/smg-mun-logo.webp",
          },
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
            name: "Journal & Insights",
            item: `${baseUrl}/blogs`,
          },
          {
            "@type": "ListItem",
            position: 3,
            name: post.title,
            item: `${baseUrl}/blogs/${post.slug.current}`,
          },
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <main>
        {/* Section 1: Article Hero */}
        <ArticleHero post={post} />

        {/* Section 2: Cover Image */}
        {coverUrl && <ArticleCover src={coverUrl} alt={post.title} />}

        {/* Section 3: Content + Sticky TOC Sidebar */}
        <ArticleContent post={post} />

        {/* Section 4: Author Card */}
        {/* {post.author && <AuthorCard author={post.author} />} */}

        {/* Section 5: Related Articles */}
        <RelatedArticles currentPost={post} allPosts={allPosts} />
      </main>
      <Footer />
    </>
  );
}


