# Search and answer-engine foundations

The application has a semantic, production-prerendered public landing page with a single H1, clear question-and-answer sections, descriptive metadata, Open Graph title/description, a local favicon, and WebApplication JSON-LD. The public text explains source attribution, supported languages, limitations and authority separation without inventing endorsements, review counts or religious answers.

Prerendering happens during `pnpm build`; HTML contains the public page before JavaScript executes. The client app is separate from public indexable content. Private routes get an empty app shell, noindex metadata and an API-backed authorization boundary. The production API sets no-store/noindex headers. Vite development remains a normal client-rendered app.

By default the entire beta is **noindex/nofollow**, with robots disallowing all paths. No deployment domain is invented. When a reviewed public landing page is ready, build with:

```sh
PUBLIC_INDEXING=true SITE_URL=https://your-confirmed-domain.example pnpm build
```

The build requires HTTPS and writes a canonical URL, a one-page sitemap and robots rules excluding `/app/`, `/api/`, login, registration and onboarding. JSON-LD describes the web application, not a certified religious authority. These controls support crawler comprehension; they do not promise rankings or AI-engine citations.

For v0.2, consider separately reviewed public educational pages with permanent URLs, edition/reviewer dates, language alternates and full source references. Do not automatically publish private chat answers as SEO content. Add an approved social sharing image, organization identity and final legal/contact pages when the brand and public domain are settled.
