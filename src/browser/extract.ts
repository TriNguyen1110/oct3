import type { Page } from "playwright-core";
import type { Lane } from "../shared/contracts";
import type { ObservedCandidate, ResearchTaskInput } from "./types";
import { BrowserIssue } from "./surfsky";

export function publicSourceUrl(value: string, lane: Lane): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new BrowserIssue("unsupported_url", "The merchant URL is invalid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new BrowserIssue("unsupported_url", "Only public HTTPS merchant URLs are supported.");
  const host = url.hostname.toLowerCase();
  const permitted = lane === "amazon" ? host === "www.amazon.com" || host === "amazon.com"
    : lane === "fiverr" ? host === "www.fiverr.com" || host === "fiverr.com"
    : host === "www.eventbrite.com" || host === "eventbrite.com";
  if (!permitted) throw new BrowserIssue("unsupported_url", "This worker supports only its selected merchant domain.");
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (!(["k", "query"] as string[]).includes(key)) url.searchParams.delete(key);
  return url.href;
}
export function researchUrl(input: ResearchTaskInput): string {
  if (input.lane === "amazon") {
    if (!("category" in input.requirements)) throw new BrowserIssue("configuration", "Amazon needs a supplies category.");
    return `https://www.amazon.com/s?k=${encodeURIComponent(input.requirements.category)}`;
  }
  if (input.lane === "fiverr") {
    if (!("category" in input.requirements)) throw new BrowserIssue("configuration", "Fiverr needs a service category.");
    return `https://www.fiverr.com/search/gigs?query=${encodeURIComponent(input.requirements.category)}`;
  }
  if (!("event_url" in input.requirements) || !input.requirements.event_url) throw new BrowserIssue("missing_event", "Choose the exact Eventbrite event URL so the ticket worker can inspect six passes.");
  const source = publicSourceUrl(input.requirements.event_url, "event_tickets");
  if (!new URL(source).pathname.startsWith("/e/")) throw new BrowserIssue("missing_event", "Use an individual Eventbrite event URL, not a search or discovery page.");
  return source;
}
export async function detectAccessBlocker(page: Page): Promise<void> {
  const url = new URL(page.url());
  const title = await page.title();
  const body = (await page.locator("body").innerText({ timeout: 8_000 })).slice(0, 10_000);
  if ((url.hostname === "www.amazon.com" || url.hostname === "amazon.com") && /^Sorry!\s*Something went wrong!?$/i.test(title.trim())) throw new BrowserIssue("provider_error", "Amazon served its error page instead of search results. No product options could be observed.");
  if (/\/(?:ap\/signin|users\/login|signin|login)(?:\/|$)/i.test(url.pathname)) throw new BrowserIssue("login_required", "This merchant requires the manager to sign in to the persistent worker browser.");
  if (/robot check|verify you are human|human verification|just a moment|pardon our interruption|access denied|security check/i.test(title + "\n" + body.slice(0, 1200)) || /enter the characters you see below|press & hold|press and hold|solve the puzzle/i.test(body)) {
    throw new BrowserIssue("challenge", "The merchant still shows a browser verification challenge; a manager handoff is needed.");
  }
}
export async function collectCandidates(page: Page, lane: Lane, input: ResearchTaskInput): Promise<ObservedCandidate[]> {
  if (lane === "amazon") {
    const cards = await page.locator('[data-component-type="s-search-result"][data-asin]').evaluateAll(nodes => nodes.slice(0, 16).map(node => ({
      title: (node.querySelector("h2")?.textContent || "").trim(),
      href: (node.querySelector('a[href*="/dp/"]') as HTMLAnchorElement | null)?.href || "",
      price: (node.querySelector(".a-price:not(.a-text-price) .a-offscreen")?.textContent || "").trim(),
      context: (node as HTMLElement).innerText?.replace(/\s+/g, " ").slice(0, 900) || "",
    })));
    return cards.flatMap(card => {
      const match = card.price.match(/^\$\s*([\d,]+(?:\.\d{1,2})?)$/);
      const asin = card.href.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
      if (!card.title || !match || !asin) return [];
      return [{ title: card.title.slice(0, 220), source_url: `https://www.amazon.com/dp/${asin}`, price_text: card.price, amount_minor: Math.round(Number(match[1].replaceAll(",", "")) * 100), quantity: 1, description: `${card.context} Displayed item price; shipping, tax and delivery eligibility still need checkout verification.` }];
    });
  }
  if (lane === "fiverr") {
    // Read visible gig-card ancestors; never private inbox/order/account content.
    const cards = await page.locator('a[href]').evaluateAll(nodes => {
      const output: { title: string; href: string; price: string; context: string }[] = [];
      const seen = new Set<string>();
      for (const node of nodes) {
        const a = node as HTMLAnchorElement;
        const title = a.innerText?.trim() || "";
        if (!/^I will\b/i.test(title) || seen.has(a.href)) continue;
        let box: HTMLElement | null = a;
        for (let depth = 0; box && depth < 7; depth++, box = box.parentElement) {
          const context = box.innerText.replace(/\s+/g, " ");
          const price = context.match(/(?:From\s*|Starting at\s*)\$\s*([\d,]+(?:\.\d{1,2})?)/i)?.[0];
          if (price && context.length < 2800) { output.push({title,href:a.href,price,context:context.slice(0,1200)}); seen.add(a.href); break; }
        }
        if (output.length >= 12) break;
      }
      return output;
    });
    return cards.flatMap(card => {
      const match = card.price.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
      if (!match) return [];
      try {
        const url = publicSourceUrl(card.href, lane);
        if (new URL(url).pathname.split("/").filter(Boolean).length !== 2) return [];
        return [{ title: card.title.slice(0,220), source_url: url, price_text: card.price, amount_minor: Math.round(Number(match[1].replaceAll(",", "")) * 100), quantity: 1, description: `${card.context} Starting package price; brief, delivery date and service fees require seller/checkout verification.` }];
      } catch { return []; }
    });
  }
  const source = publicSourceUrl(page.url(), lane);
  const data = await page.locator('script[type="application/ld+json"]').allTextContents();
  const events: Record<string, unknown>[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    const kind = obj["@type"];
    if ((typeof kind === "string" && /Event$/.test(kind)) || (Array.isArray(kind) && kind.some(type => typeof type === "string" && /Event$/.test(type)))) events.push(obj);
    if (obj["@graph"]) visit(obj["@graph"]);
  }
  for (const raw of data) { try { visit(JSON.parse(raw)); } catch { /* Ignore malformed merchant markup. */ } }
  const quantity = "quantity" in input.requirements ? input.requirements.quantity : 1;
  const candidates: ObservedCandidate[] = [];
  for (const event of events) {
    const offers = Array.isArray(event.offers) ? event.offers : [event.offers];
    for (const value of offers) {
      if (!value || typeof value !== "object") continue;
      const offer = value as Record<string, unknown>;
      const isMinimum = offer.price === undefined && offer.lowPrice !== undefined;
      const rawAmount = offer.price ?? offer.lowPrice;
      if (rawAmount === undefined || rawAmount === null || rawAmount === "") continue;
      const amount = Number(rawAmount);
      const currency = String(offer.priceCurrency || "").toUpperCase();
      if (!Number.isFinite(amount) || amount < 0 || currency !== "USD" || !event.name) continue;
      const availability = String(offer.availability || "");
      const eventDate = typeof event.startDate === "string" ? event.startDate : undefined;
      if ("date" in input.requirements && /^\d{4}-\d{2}-\d{2}/.test(input.requirements.date) && eventDate && input.requirements.date.slice(0,10) !== eventDate.slice(0,10)) throw new BrowserIssue("merchant_changed", "The event listing date differs from the requested date. Confirm the exact event before proceeding.");
      candidates.push({ title: String(event.name).slice(0,220), source_url: source, price_text: `${isMinimum ? "From " : ""}$${amount.toFixed(2)} per ticket${isMinimum ? " (listed minimum)" : ""}`, amount_minor: Math.round(amount * 100) * quantity, quantity, available: /SoldOut|OutOfStock|Discontinued/i.test(availability) ? false : quantity === 1 && /InStock|PreOrder|LimitedAvailability/i.test(availability) ? true : undefined, delivery_date: eventDate, description: `${typeof event.description === "string" ? event.description.replace(/<[^>]+>/g, " ").slice(0,500) : "Event listing"}. Listed ${eventDate || "date not confirmed"}; ${quantity} requested passes using ${isMinimum ? "the listed minimum" : "the listed price"} $${amount.toFixed(2)} each. Ticket type, fees and availability for the full group still require checkout verification.` });
    }
  }
  return candidates;
}
