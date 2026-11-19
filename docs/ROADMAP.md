# Roadmap

Dated, ordered by what a coaching-centre marketing team needs first, with what each step costs. Costs assume the current stack (Vercel, Supabase, a hosted LLM) and are monthly unless stated.

| When | Step | Why | Cost |
| --- | --- | --- | --- |
| Dec 2026 | **Pilot with 3 coaching centres.** Their own guides compiled into Brand Kits; 50 real drafts each reviewed; precision and recall re-measured on those drafts and published beside the synthetic numbers. | Our numbers come from a set we wrote. Real drafts are the honest test. | Free tiers; about 20 hours of our time per centre |
| Dec 2026 | **Accounts and organisations.** Supabase Auth with the four roles, an organisation per centre, row-level security per organisation, invitations. | Replaces the demo role switcher (known issue 1). | Supabase Pro ₹2,100 (US$25) |
| Jan 2027 | **Paid AI tier with a second provider.** One paid key as the first choice, free tiers as fallback; per-organisation monthly AI budget with a warning at 80%. | Removes the free-tier rate limits (known issue 2). | Estimate: about 20 AI calls of about 2,000 tokens each per draft, under ₹1 per draft on a paid open-model tier; about ₹1,500 a month for a centre doing 1,500 drafts |
| Jan 2027 | **Change impact, scheduled.** A daily job that expires facts on their end date and runs the impact check, emailing the owner of every piece sent back for re-approval. | Today the impact check runs when someone edits a fact; expiry should not need a person. | Vercel Cron, included |
| Feb 2027 | **Publishing integrations.** Instagram, WhatsApp Business and Google Docs add-ons that call `check_draft` before posting, using the API built in Round 3. | Checks happen where people already write. | Developer time; API costs as above |
| Mar 2027 | **Visual depth.** Logo variants (reversed, monochrome) from an asset library; layout rules (logo position, minimum text size); vision checks for claims set in images of documents. | Known issues 4 and 10. | Vision calls about ₹0.5 per image |
| Q2 2027 | **Regulation packs beyond coaching.** ASCI guidelines for ed-tech, health and finance claims, each with tests and cited sources, reviewed by a lawyer before release. | The same engine serves other regulated sectors. | Legal review ₹30,000–50,000 per pack (one-off) |
| Q2 2027 | **Pricing.** Free for one user and 30 drafts a month; ₹1,999 a month per centre for the team plan with the API. | Covers AI and hosting at about 40% margin at 1,500 drafts a month. | — |

## What we will measure

- Precision and recall on real pilot drafts (target: precision above 90% with AI on).
- Time from draft to approval, before and after Guidewise, at each pilot centre.
- Share of findings dismissed, per rule, and whether amendments bring it down (Insights already shows before and after).
