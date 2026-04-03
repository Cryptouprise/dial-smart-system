

# Blog SEO Domination: Images, Interlinking, and GEOAEO Optimization

## What Gets Built

### 1. Copy Split Images + Assign Featured Images to ALL 202 Blogs
- Copy 38 images from `content/images/split/` to `public/showcase/images/blog/` (web-accessible)
- Assign `featuredImage` to the 16 blogs currently missing one via keyword matching against the 47 available images
- Fix image CSS: change `object-fit: cover` with fixed 180px height to `object-fit: contain` with dark background fill -- stops the "cut off" problem on both blog index cards and individual blog pages

### 2. Blog-to-Blog Interlinking (SEO Power Move)
- Add a `relatedPosts` array to every blog entry in `seo-data.json` (3-5 related slugs per post)
- Matching logic: same category first, then keyword overlap, then cross-category for topical authority
- Update `blog.html` template to render "Related Articles" as clickable links **inside the article body** (not just the random "More from the Blog" grid at the bottom)
- Add inline contextual links: after every 2nd section (`<h2>`), inject a "You might also like: [Related Title]" link to a same-category post -- this creates a deep internal link mesh that search engines follow
- The existing "More from the Blog" grid at the bottom switches from random shuffle to **related posts first**, then random fill

### 3. FAQ Generation for All 202 Blogs (Currently Only 15 Have FAQs)
- Generate 3-5 FAQ pairs per blog using title + section headings as source material
- Each FAQ gets proper `FAQPage` schema.org markup (already wired in blog.html, just needs data)
- FAQs are the #1 signal for Google's "People Also Ask" and AI answer boxes

### 4. Enhanced Schema.org Markup
- **Blog index**: Add `CollectionPage` schema with `hasPart` referencing all articles
- **Each blog post**: Add `BreadcrumbList` schema (Home > Blog > Category > Article)
- **Each blog post**: Add `speakable` property for voice search / AEO targeting
- **Each blog post**: Expand `Article` schema with `articleSection`, `wordCount`, `keywords`, `about` (category topic entity)

### 5. Geo + AEO Signals
- Add `about` schema entities linking articles to geographic and industry topics (e.g., `{"@type": "Thing", "name": "AI Sales Automation for Law Firms"}`)
- Add `mentions` array in schema for key terms (speed-to-lead, database reactivation, etc.) -- helps AI engines understand topical authority
- Update `sitemap.xml` to include all 202 blog URLs with `lastmod`, `changefreq: weekly`, and `priority: 0.7`
- Add a `BlogPosting` sitemap section separate from pages for better crawl signaling

### 6. Search Bar Improvement
- Move search above category filters, make it larger with placeholder "Search 202+ articles..."
- Add results counter: "Showing X of Y articles"
- Increase initial page size from 24 to 48

## Files Modified
- `public/showcase/seo-data.json` -- Add `relatedPosts`, `featuredImage` (16 missing), FAQ data (187 missing)
- `public/showcase/templates/blog.html` -- Inline related links, related posts grid, breadcrumb schema, speakable, enhanced Article schema
- `public/showcase/blog-index.html` -- Search improvements, image crop fix, CollectionPage schema
- `public/sitemap.xml` -- All 202 blog URLs with proper metadata
- `public/showcase/images/blog/` -- 38 split images copied in

## Files Created
- Build script (one-time Node script) to generate relatedPosts, FAQs, and image assignments

## Technical Details

**Interlinking algorithm**: For each blog, score all other blogs by: +3 same category, +2 per shared keyword, +1 same relatedIndustry. Take top 5 as `relatedPosts`. This creates a dense link graph where every article connects to 5 others, and every article is linked FROM multiple others.

**Inline contextual links**: After every 2nd `<h2>` section in the article body, the template injects a styled "Related Reading" callout linking to a related post. This puts links IN the content flow (not just footer), which search engines weight more heavily.

**FAQ generation**: Template-based from article structure: "What is [section title]?", "How does [topic] work for [industry]?", "Why is [key concept] important?" -- covers the exact queries AI engines pull for featured snippets.

**Sitemap**: 202 blog URLs + existing showcase pages = 290+ indexed URLs. Each blog URL formatted as `/showcase/templates/blog.html?post=slug` with weekly changefreq.

**AEO targeting**: `speakable` schema property marks the first section + description as voice-search-ready content. `mentions` entities create topical authority signals that AI engines (Google SGE, Bing Copilot, Perplexity) use to determine expertise.

