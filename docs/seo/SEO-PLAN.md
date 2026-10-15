# Sondhan — SEO / AEO / GEO plan (2026-10-15)

Canonical host: **https://www.sondhan.org** (apex `sondhan.org` 308-redirects to `www`; Cloudflare in front of Vercel).
Nothing here guarantees rankings or AI citations. Everything below is eligibility, relevance and measurement.

## 1. Audit findings (live responses inspected 2026-10-15)

| # | Finding | Evidence | Pri |
|---|---|---|---|
| 1 | Production stability gate met: live `sw.js` is v46 (the outage fix) | live `/sw.js` | — |
| 2 | **No `sitemap.xml`** | `/sitemap.xml` → 404 | P0 |
| 3 | **`robots.txt` has no crawl rules and no sitemap line** — only Cloudflare's content-signal comment block (served by Cloudflare; Vercel returned NOT_FOUND) | `/robots.txt` | P0 |
| 4 | Homepage `<title>` was just "Sondhan"; no meta description, canonical, OG, JSON-LD, or `<h1>` | live `/` source | P1 |
| 5 | Only 4 sondhan.org URLs surfaced for `site:sondhan.org`: `/`, `about.html`, `bloodbank.html`, **`register.html`** (login-gated/redirect page that should not be indexed). `search.html` and `donor` were not among them. Treat as a hint, not an authoritative index report — verify in Search Console. | web search | P1 |
| 6 | Duplicate URLs: `/donor` (rewrite) and `/donor.html`; `/` and `/index.html` | vercel.json, nav links | P1 |
| 7 | Private/auth pages indexable: login, signup, register, profile, request, admin | no robots meta | P0 |
| 8 | Contact email is obfuscated by Cloudflare Email Obfuscation (`/cdn-cgi/l/email-protection`) — fine for spam, invisible to crawlers; address is `sondhan.org26@gmail.com` (used in Organization schema) | live `/` | P2 |
| 9 | Content is client-rendered from Firestore (donor lists, blood banks). Static HTML for `search.html`/`bloodbank.html` is thin (~700 chars). This is *correct* for donors (privacy), but means blood-bank pages have little indexable text | source | P2 |
| 10 | **Content/consistency issues needing owner decision** (not changed by me): `about.html` hard-codes "৬৪ জেলায় সেবা" (unverified claim); `privacy.html` §4 says search results go to *logged-in* users but search is now public | source | P1 |
| 11 | Cloudflare "AI crawl control"/bot-fight settings can block legitimate search bots (OAI-SearchBot, Bingbot, Googlebot) — cannot be inspected from here | — | P0-verify |

## 2. Implemented in this change (static, no JS, no Firebase/rules changes)

- `robots.txt` (allow all, sitemap line). Private pages use `noindex, follow` meta **and** `X-Robots-Tag` (vercel.json) — not `Disallow`, so crawlers can actually see the noindex. CSS/JS are not blocked. Search crawlers and training crawlers are not distinguished here: no per-bot blocks added. Decision for owner: the Cloudflare content-signals block expresses no preference; if you want `ai-train=no` while keeping `search=yes, ai-input=yes`, set it in Cloudflare → Security → Bots → Robots.txt management (it prepends to our file).
- `sitemap.xml`: 7 core pages + 5 guide pages. Excludes login/profile/etc. and any donor data.
- Per-page title/description/canonical/OG/Twitter on 8 public pages; canonical for donor registration = `/donor` (the URL being shared).
- `register.html`: 301 → `/donor` (vercel.json) + noindex.
- Homepage: visible factual "what is Sondhan" section with the first `<h1>`, links to guides; Organization + WebSite JSON-LD (real name, URL, logo, email, public social profiles; no ratings/reviews/addresses/hours).
- 5 Bengali pages under `/guides/` (hub + 4), Article + BreadcrumbList JSON-LD, zero JavaScript, no phone numbers or donor data.
- `scripts/predeploy-check.mjs` now also fails the deploy if: sitemap URL lacks a file/canonical/description/real title, JSON-LD is invalid, a noindex page is in the sitemap, a private page lost noindex, robots.txt blocks the site, or a guide contains a script or phone-like number.

## 3. Search-intent map (one primary intent per URL)

Demand and difficulty are **not measured yet** — no keyword-volume tool was available (Ahrefs/Similarweb connectors failed). Validate every row in Google Search Console (Performance → Queries) and Google Trends/Keyword Planner before investing further.

| URL | Primary intent | Example queries (hypotheses) |
|---|---|---|
| `/` | Brand + navigational + "what is it" | sondhan, সন্ধান রক্তদাতা, blood donor app Bangladesh |
| `/search.html` | Transactional: find donor by group+place | রক্তদাতা খুঁজুন, blood donor search Bangladesh |
| `/bloodbank.html` | Find blood bank/organisation | ব্লাড ব্যাংক ঢাকা, blood bank list Bangladesh |
| `/donor` | Register as donor | রক্তদাতা হিসেবে নিবন্ধন, become blood donor Bangladesh |
| `/guides/find-blood-donor.html` | How to find a donor | কীভাবে রক্তদাতা খুঁজব |
| `/guides/emergency-blood-needed.html` | Emergency checklist | জরুরি রক্ত প্রয়োজন কী করব |
| `/guides/blood-group-compatibility.html` | Informational | কে কাকে রক্ত দিতে পারে, রক্তের গ্রুপ টেবিল |
| `/guides/become-blood-donor.html` | Pre-donation info | রক্তদানের আগে কী জানা দরকার, প্রথমবার রক্তদান |

**Backlog (write only when there is real, distinct content):** "রক্তদানের পর করণীয়", "রক্তদানের নিরাপত্তা" (needs medical sourcing), "How to find blood donors in Bangladesh" (English — only if Search Console shows English demand), FAQ-style pages from real user questions.

## 4. Location pages — recommendation: **postpone**

Per-district pages would currently differ only by place name (the data is client-side Firestore; donor availability is not maintained text). That is thin/doorway content. Revisit when, for a given city, you can honestly publish *distinct* facts: verified blood banks/organisations with sources and last-checked dates (e.g. Dhaka, Chattogram, Sylhet), how to use the area filter, and Dhaka locality notes (Uttara, Mirpur, Dhanmondi… are **city localities**, not upazilas). Gate: ≥1 verified, sourced, dated local fact per page + the donor count must come from a real maintained number, never an invented one. No donor contact data in HTML, ever.

## 5. Competitor snapshot (observed via web search 2026-10-15; excerpts only — not full audits)

| Site | Observed | Note |
|---|---|---|
| BloodLine / Badhan (Play Store app) | Rated 4.7 (1,126) on Google Play | Strong app presence |
| badhan.org | Org site with blood request list | University-volunteer brand |
| roktalap.com | "Emergency… fast, reliably, securely" platform | Similar positioning |
| bloodsharebd.com | Claims "Bangladesh's largest free platform… 64 districts" + long guide page | Claim is theirs, unverified by me |
| donatebloodbd.com, bloodhelpbd.com, bmhbd.org, bloodfind.pro.bd, bdfb.info | Bengali/English donor search sites; some claim donor counts | Crowded niche |
| daktarbooking.com, seradoctor.com, daktarachen.com, sebamedi.com, allshebabd.com, bdbestdoctors.com | Directories listing donors, some with phone numbers in page text | Privacy-weak pattern |
| bdrcs.org | Red Crescent blood centres with phone numbers | Authoritative |

Hypotheses (verify before acting): (a) many competitors expose donor phone numbers in indexable HTML — Sondhan's donor-chosen, non-public contact model is a genuine differentiator, but only advertise it as long as production behaves that way; (b) most have long-form Bengali guides — Sondhan's new guides close part of that gap; (c) the head terms are dominated by older domains, so realistic early wins are long-tail Bengali queries and branded search. Do not publish comparison claims about competitors.

## 6. AEO / GEO notes

- AI search systems read ordinary crawlable text; the homepage and guides now state plainly what Sondhan is, who it serves (Bangladesh), how search works (blood group + area, no login), how to register, what it does **not** do. No superlatives, no fabricated stats, no hidden text, no instructions aimed at AI systems.
- `llms.txt` is not a standard any major search engine is documented to use; not added.
- FAQ rich results are restricted by Google for most sites; guides use visible Q&A-style headings instead of FAQPage markup.
- Verify in Cloudflare that Googlebot, Bingbot and OAI-SearchBot are not challenged (Security → Events; Bots → "Block AI bots" / "Bot Fight Mode"). Search crawlers and model-training crawlers are separate decisions with different privacy trade-offs: public pages here contain no donor PII, so allowing search crawlers has no donor-privacy cost; training access is a policy choice for the owner.
- IndexNow: optional for Bing/others; needs a key file at the site root — not added (low value for ~12 URLs; revisit with more content).

## 7. Measurement plan

Baseline **before** relying on any change (Search Console → Performance, last 3 months, export): impressions, clicks, CTR, avg position, indexed pages (Pages report). Split branded ("sondhan", "সন্ধান") vs non-branded. Also: Bing Webmaster Tools (import from GSC), Core Web Vitals report (field data), conversions = visits to `/donor` and completed registrations (count of new `donors` docs/day from Firestore — server-side, no extra tracking script).

| Horizon | Check |
|---|---|
| 30 days | Sitemap read OK; indexed count of the 12 sitemap URLs; `register.html` dropped; non-branded impressions > 0; no new Coverage errors |
| 60 days | Guide pages' impressions/queries; CTR of home/search; mobile CWV (LCP/INP/CLS) good-URL share |
| 90 days | Non-branded clicks trend; `/donor` organic visits → registrations; which guides earn links/mentions |

No fixed ranking or growth target is promised.

## 8. Manual actions that need account access

1. Verify `https://www.sondhan.org` in Google Search Console (Domain property preferred; DNS TXT at Cloudflare) and submit `sitemap.xml`. Inspect URL → request indexing for `/`, `/search.html`, `/donor`.
2. Bing Webmaster Tools: import from GSC; submit sitemap.
3. Cloudflare: confirm search bots aren't blocked; decide AI-training signal (see §2).
4. Decide on the two content inconsistencies in §1 #10.
5. Backlinks (earned only): Bangladesh Red Crescent/Badhan-style university groups, campus blood clubs, local news, community pages. No bought links/PBNs/fake profiles. Never present Sondhan as a hospital or government service.

## 9. Medical-claim review checklist (before wider promotion)

The guides deliberately avoid hard numbers. Have a qualified clinician or the national transfusion programme review these, and cite sources (WHO blood donor selection guidance; Bangladesh national safe blood transfusion programme/DGHS):
- [ ] "Minimum 4 months between donations" (appears on the homepage and in a guide as *Sondhan's general guidance*; center rules prevail).
- [ ] "~450 ml" per donation (homepage).
- [ ] Compatibility table (standard ABO/Rh red-cell rules; plasma/platelet rules differ and are not covered).
- [ ] Minimum donor age 18 (from Sondhan's own terms).
- [ ] Homepage claim "হৃদরোগ ও ক্যান্সারের ঝুঁকি কমায়" (health-benefit claim; likely needs removal or a citation).
- [ ] Any statement about legality of buying/selling blood (not made in the guides).
