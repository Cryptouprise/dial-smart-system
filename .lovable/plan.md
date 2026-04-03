

# Blog System Build Plan

## Current State
- **163 markdown articles** sitting in `content/` across 6 directories — completely disconnected from the site
- **9 marketing images** in `content/images/marketing/` — unused
- **15 blog entries** hardcoded in `seo-data.json` — none from your new articles
- **No blog index page** — nowhere to browse articles
- **No links** from homepage or showcase hub to any blog content
- The blog template (`public/showcase/templates/blog.html`) exists and works, but has nothing to display from the new content

## What Gets Built

### 1. Parse & Import All 163 Articles into seo-data.json
A build script reads every markdown file from all 6 directories, extracts title, slug, sections (h2 + content), generates meta descriptions, estimates read time, assigns categories (Legal, Solar/Insurance, Debt/MCA, Cross-Industry, Objection Handlers, ROI/Results, Pain Points), and appends them all to the `blogs` array in `seo-data.json`.

### 2. Build the Blog Index Page
Create `public/showcase/blog-index.html` — a filterable card grid listing all ~178 articles (15 existing + 163 new). Matches the dark/cyan showcase aesthetic. Category filter tabs at top. Each card shows title, category badge, read time, excerpt. Links to the existing `blog.html?post=slug` template.

### 3. Copy Marketing Images & Assign to Articles
Move the 9 marketing images from `content/images/marketing/` into `public/showcase/images/blog/` so they're web-accessible. Map them to relevant articles by keyword matching. Update blog template to render featured images in the hero section.

### 4. Wire Up All the Interlinking
- **Showcase Hub** (`index.html`): Add a "Blog" card linking to the blog index
- **Blog Index** → Hub: Back-link in nav
- **Blog Template**: Update back-link to point to blog index (not hub)
- **React Landing Page** (`LandingPage.tsx`): Add a "Read Our Blog" section with 3-4 featured article cards linking into the blog system
- **Blog posts**: Already have "More from the Blog" grid and demo CTAs — these work automatically once articles are in seo-data.json
- **tracker.js**: Add blog index to page detection for consistent navigation

### 5. QA Marketing Images
Verify all 9 images in `content/images/marketing/` are properly sized and not cut off from collage extraction. Fix any that are broken.

## Technical Details

**Article parsing**: Each markdown file uses `##` for section headers. The script splits on `##`, extracts the first line as title (or `#` heading), generates a URL slug from the filename, and builds the seo-data.json entry format matching the existing 15 blogs.

**Category mapping**:
- `content/blogs/` + `content/articles/` → "Legal"
- `content/bonus-articles/001-015` → "Legal — Practice Areas"
- `content/bonus-articles/016-025` → "Objection Handlers"
- `content/bonus-articles/026-050` → "Data & ROI"
- `content/cross-industry/` → "Cross-Industry"
- `content/debt-mca/` → "Debt & MCA"
- `content/solar-insurance/` → "Solar & Insurance"

**Blog index page**: Static HTML, loads from seo-data.json at runtime (same pattern as other showcase pages). No React changes needed for the index itself.

**Files created**: ~3 (blog-index.html, build script, image copies)
**Files modified**: ~5 (seo-data.json, index.html, blog.html, LandingPage.tsx, tracker.js)

**Estimated scope**: This is a big one — the bulk is the build script parsing 163 files and generating JSON entries.

