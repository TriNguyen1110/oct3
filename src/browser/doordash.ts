import { createHash } from "node:crypto";
import type { Locator, Page } from "playwright-core";
import type { Evidence, Option } from "../shared/contracts";
import { BrowserIssue, withSurfskyPage } from "./surfsky";
import type { ResearchTaskInput, ResearchTaskResult } from "./types";

const doorDashUrl = "https://www.doordash.com/store/boba-guys-san-francisco-880283/?pickup=true";
const storeUrl = "https://boba-guys.square.site/";
const configuredItemMinor = 660;
const id = (...parts:string[]) => createHash("sha256").update(parts.join("\u001f")).digest("hex").slice(0,24);
const money = /^\$(\d{1,3}(?:,\d{3})*\.\d{2})$/;
type Row={title:string;price:string;context:string};

export function parseDoorDashRows(rows:Row[],query:string){
  const tokens=query.toLowerCase().split(/[^a-z0-9]+/).filter(token=>token.length>2);
  const parsed=rows.flatMap(row=>{
    const match=row.price.match(money);if(!match||!row.title.trim()||/delivery fee|subtotal|dashpass|group order/i.test(row.title))return [];
    const unit=Math.round(Number(match[1].replaceAll(",",""))*100);if(!Number.isSafeInteger(unit)||unit<=0)return [];
    const haystack=`${row.title} ${row.context}`.toLowerCase();
    return [{title:row.title.trim().slice(0,180),unit_minor:unit,context:row.context.replace(/\s+/g," ").trim().slice(0,400),score:tokens.filter(token=>haystack.includes(token)).length}];
  });
  const deduped=[...new Map(parsed.map(item=>[`${item.title}:${item.unit_minor}`,item])).values()];
  const matched=deduped.some(item=>item.score>0)?deduped.filter(item=>item.score>0):deduped;
  return matched.sort((a,b)=>b.score-a.score||a.unit_minor-b.unit_minor).slice(0,3);
}

function evidence(input:ResearchTaskInput,source:string,title:string,detail:string):Evidence{
  const at=new Date().toISOString();return {id:id(input.task_id,input.attempt_key,title,at),task_id:input.task_id,source_url:source,observed_at:at,title,detail,mode:"live",kind:"observation"};
}
const signalFor=(input:ResearchTaskInput)=>AbortSignal.any([AbortSignal.timeout(Math.max(10_000,Math.min(input.timeout_ms??60_000,60_000))),...(input.signal?[input.signal]:[])]);

/** This worker has no order-execution capability, even after a plan approval. */
export async function restrictFoodToReadOnly(page: Page) {
  await page.context().routeWebSocket("**/*", socket => socket.close());
  await page.context().route("**/*", route => ["GET", "HEAD", "OPTIONS"].includes(route.request().method().toUpperCase()) ? route.continue() : route.abort("blockedbyclient"));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setBypassServiceWorker", { bypass: true });
  // Retain the session for the page lifetime and apply bypass after routing setup.
}

export async function researchDoorDash(input:ResearchTaskInput):Promise<ResearchTaskResult>{
  const started=Date.now(),observations:Evidence[]=[];
  if(input.lane!=="food"||!("query" in input.requirements))return {options:[],evidence:[],blocker:"Food research requires a query, fulfillment mode, location and quantity.",blocker_code:"configuration",progress:"Food requirements are incomplete.",elapsed_ms:Date.now()-started,cleanup:"not_started"};
  const requirement=input.requirements;
  if(requirement.quantity!==1)return {options:[],evidence:[],blocker:"This observed Boba Guys preparation supports exactly one drink.",blocker_code:"configuration",progress:"Choose quantity one for the current food worker.",elapsed_ms:Date.now()-started,cleanup:"not_started"};
  if(requirement.fulfillment!=="pickup"||!/(?:boba|bubble tea|milk tea)/i.test(requirement.query))return {options:[],evidence:[],blocker:"This bounded food worker currently supports boba pickup near the selected San Francisco venue.",blocker_code:"configuration",progress:"Choose boba pickup for the current food worker.",elapsed_ms:Date.now()-started,cleanup:"not_started"};
  if(!/\b580\s+20th\s+(?:st(?:reet)?\.?)(?:,|\s).*san francisco/i.test(requirement.location))return {options:[],evidence:[],blocker:"This observed pickup preparation is pinned to the supplied 580 20th Street, San Francisco location.",blocker_code:"configuration",progress:"Use the verified pickup location for the current food worker.",elapsed_ms:Date.now()-started,cleanup:"not_started"};
  try{
    await input.onProgress?.({task_id:input.task_id,lane:"food",at:new Date().toISOString(),message:"Opening Boba Guys' official Order Ahead page in the persistent food browser."});
    const run=await withSurfskyPage("food",signalFor(input),async page=>{
      await restrictFoodToReadOnly(page);
      const visible=async(locator:Locator)=>{for(const candidate of await locator.all())if(await candidate.isVisible().catch(()=>false))return candidate;return undefined;};
      const waitVisible=async(locator:Locator,timeout=8_000)=>{const deadline=Date.now()+timeout;do{const candidate=await visible(locator);if(candidate)return candidate;await page.waitForTimeout(250);}while(Date.now()<deadline);return undefined;};
      const selectAndReadBack=async(label:RegExp)=>{
        const text=await waitVisible(page.getByText(label));if(!text)throw new BrowserIssue("merchant_changed",`The Classic Black form no longer exposes the observed ${label.source} choice.`);
        const semantic=text.locator("xpath=ancestor-or-self::*[@role='radio' or @role='checkbox' or @aria-pressed][1]");
        const field=text.locator("xpath=ancestor::label[.//input[@type='radio' or @type='checkbox']][1]").locator("input[type='radio'],input[type='checkbox']").first();
        if(await field.count()){
          if(!await field.isChecked().catch(()=>false))await text.locator("xpath=ancestor::label[1]").click();
          if(!await field.isChecked().catch(()=>false))throw new BrowserIssue("merchant_changed",`Square did not retain the observed ${label.source} selection.`);
          return;
        }
        if(await semantic.count()){
          const selected=async()=>["true","checked"].includes((await semantic.getAttribute("aria-checked")||await semantic.getAttribute("aria-pressed")||"").toLowerCase());
          if(!await selected())await semantic.click();
          if(!await selected())throw new BrowserIssue("merchant_changed",`Square did not retain the observed ${label.source} selection.`);
          return;
        }
        throw new BrowserIssue("merchant_changed",`The observed ${label.source} choice has no readable selected state.`);
      };
      const response=await page.goto(storeUrl,{waitUntil:"domcontentloaded"});if(response&&response.status()>=400)throw new BrowserIssue(response.status()===403?"challenge":"provider_error",`Boba Guys' official Order Ahead page returned HTTP ${response.status()} before the menu was available.`);
      await page.waitForTimeout(3_000);
      if(new URL(page.url()).hostname!=="boba-guys.square.site")throw new BrowserIssue("merchant_changed","Boba Guys' official Order Ahead page redirected to an unsupported host.");
      const pickup=page.getByText("Pickup",{exact:true}).first();
      if(await pickup.isVisible().catch(()=>false))await pickup.click();
      const target=page.locator('input[placeholder="Search by city, state, or ZIP"],input[placeholder*="address" i],input[aria-label*="address" i]').first();
      let finderOpen=false;
      if(await target.isVisible().catch(()=>false)){
        finderOpen=true;
        await target.fill(requirement.location);
      }
      if(!finderOpen)throw new BrowserIssue("merchant_changed","The location picker must be open so the exact Potrero address and selected store can be verified.");
      const potrero=await waitVisible(page.getByText("Boba Guys Potrero",{exact:true}));
      if(!potrero)throw new BrowserIssue("merchant_changed","The location search did not expose the observed Boba Guys Potrero result.");
      if(finderOpen){
        const tile=potrero.locator("xpath=ancestor::label");const radio=tile.locator('input[type="radio"]').first();
        if(!await radio.count()||!/1002 16th St[\s\S]*San Francisco, CA 94107/.test(await tile.innerText()))throw new BrowserIssue("merchant_changed","The Potrero result did not match the observed store address and selection control.");
        if(!await radio.isChecked().catch(()=>false))await tile.click({position:{x:12,y:12}});
        if(!await radio.isChecked().catch(()=>false))throw new BrowserIssue("merchant_changed","Square did not retain Boba Guys Potrero as the selected store.");
        const confirm=await waitVisible(page.getByRole("button",{name:/^(?:Confirm location|Update changes)$/}),3_000);if(!confirm)throw new BrowserIssue("merchant_changed","The location picker did not expose its observed confirmation control.");await confirm.click();
      }
      let item=await waitVisible(page.getByText("Classic Black",{exact:true}),8_000);
      if(!item){const category=await waitVisible(page.getByText("Build Your Drink",{exact:true}),2_000);if(category){await category.click();item=await waitVisible(page.getByText("Classic Black",{exact:true}),4_000);}}
      if(!item)throw new BrowserIssue("merchant_changed","The official Potrero menu did not expose the observed Classic Black item.");
      await item.click();await page.waitForTimeout(1_000);
      for(const choice of [/16oz ICED/i,/^Boba(?:\s|$)/i,/Organic Half \+ Half \(Clover\)/i,/50% \(recommended\)/i]){
        await selectAndReadBack(choice);
      }
      const add=await waitVisible(page.getByRole("button",{name:/Add to order\s+\$6\.60/i}),3_000);
      if(!add)throw new BrowserIssue("merchant_changed","The configured item did not produce the observed $6.60 Add to order control.");
      const menuProof=evidence(input,storeUrl,"Official Boba Guys pickup controls observed",`The page exposed the exact Boba Guys Potrero address and selected radio state, then the Classic Black form. The worker read back selected states for the requested controls and observed “Add to order $6.60”, without activating it. No prepared cart or checkout is claimed.`);observations.push(menuProof);
      const proof=evidence(input,storeUrl,"Classic Black item estimate",`Selected-state readback passed for 16oz ICED, Boba, Organic Half + Half (Clover), and 50% sweetness (recommended). The Add to order control displayed $6.60. Tax, final total, pickup time and availability require review.`);observations.push(proof);
      const total=configuredItemMinor*requirement.quantity;
      const options:Option[]=[{id:id(input.task_id,storeUrl,"Classic Black",String(total)),title:"Classic Black",description:`Official Boba Guys pickup form showed a $6.60 item estimate. Suggested recipe: 16oz iced Classic Black with boba, Organic Half + Half (Clover), and 50% sweetness. Confirm the selected store, modifiers, tax, final total, availability and pickup time. This worker cannot place an order.`,source_url:storeUrl,merchant:"Boba Guys",amount_minor:total,currency:"USD",quantity:requirement.quantity,recommended:true,reason:"Observed menu controls and item estimate; selected-state and checkout verification remain incomplete.",evidence_ids:[menuProof.id,proof.id]}];
      return {options};
    });
    const message="Observed Classic Black pickup controls and a $6.60 item estimate. Confirm the selected store and modifiers; no cart or checkout was prepared.";
    await input.onProgress?.({task_id:input.task_id,lane:"food",at:new Date().toISOString(),message});
    return {...run.value,evidence:observations,progress:message,elapsed_ms:Date.now()-started,cleanup:run.cleanup,blocker:"Selected drink options and final checkout need manager verification. Automatic food ordering is not implemented.",blocker_code:"checkout_handoff",...(run.cleanup==="unconfirmed"?{blocker:"Browser cleanup could not be confirmed. Reconcile the food worker before retrying.",blocker_code:"provider_error" as const}:{})};
  }catch(error){const issue=error instanceof BrowserIssue?error:new BrowserIssue(input.signal?.aborted?"cancelled":"provider_error","Boba Guys pickup preparation could not finish.");observations.push(evidence(input,storeUrl,"Boba Guys pickup needs attention",`${issue.message} No checkout, order or payment action was submitted. DoorDash fallback source: ${doorDashUrl}`));return {options:[],evidence:observations,blocker:issue.message,blocker_code:issue.code,progress:issue.message,elapsed_ms:Date.now()-started,cleanup:issue.cleanup};}
}
