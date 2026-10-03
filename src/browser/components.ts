import { createHash, randomUUID } from "node:crypto";
import type { Locator, Page } from "playwright-core";

export type ComponentKind = "text" | "select" | "radio" | "checkbox";
export type ComponentValue = string | boolean;
export interface TaskComponent {
  control_id: string; id: string; label: string; kind: ComponentKind;
  required: boolean; options: string[]; hasValue: boolean;
  group?: string;
}
export interface ComponentSnapshot {
  snapshot_id: string; task_id: string; revision: number; observed_at: string;
  controls: TaskComponent[]; excluded_required_count: number; truncated: boolean;
}
export interface ComponentPolicy {
  task_id: string;
  /** Trusted server policy; never supplied by a model or merchant page. */
  allowedOrigins: string[];
  allowedFields?: { id?: string; label_exact?: string; kind?: ComponentKind }[];
  allowConsent?: boolean;
  /** Omission is read-only; mutation requires explicit false plus an exact allowlist. */
  readOnly?: boolean;
  signal?: AbortSignal;
  controlTimeoutMs?: number;
}
export interface SuppliedField {
  control_id?: string; id?: string; label_exact?: string; value: ComponentValue;
}
export type ComponentFailureCode = "not_inspected" | "stale_snapshot" | "stale_control" | "ambiguous_control" | "field_not_allowed" | "value_not_planned" | "invalid_value" | "missing_option" | "value_not_retained" | "timeout" | "cancelled" | "wrong_origin" | "layout_limit" | "busy" | "interaction_failed";
export interface ComponentFailure { ok: false; code: ComponentFailureCode; message: string; snapshot?: ComponentSnapshot }
class ComponentIssue extends Error {
  constructor(public code: ComponentFailureCode, message: string) { super(message); }
}
interface ObservedControl extends TaskComponent { group_has_value: boolean; consent: boolean; max_length: number; valid: boolean; native_type: string }
interface Inspection { controls: ObservedControl[]; excluded_required_count: number; truncated: boolean }
const normalLabel = (value: string) => value.replace(/\s+/g," ").trim();

/** All operations share this exact page and its 90-second worker budget. */
export function createComponentToolkit(page: Page, policy: ComponentPolicy) {
  const prefix = randomUUID();
  const signal = AbortSignal.any([AbortSignal.timeout(90_000), ...(policy.signal ? [policy.signal] : [])]);
  const controlTimeout = Math.max(500, Math.min(policy.controlTimeoutMs ?? 8_000,8_000));
  let snapshot: ComponentSnapshot | undefined;
  let observed: ObservedControl[] = [];
  let fingerprint = "";
  let revision = 0;
  let busy = false;
  let poisoned = false;
  let mutations = 0;
  let planned = new Map<string, ComponentValue>();

  function checkContext() {
    if (signal.aborted) throw new ComponentIssue("cancelled","The browser worker budget ended or the task was cancelled.");
    if (poisoned) throw new ComponentIssue("timeout","A timed-out component operation ended this page; resume through the owning worker.");
    let origin: string;
    try { origin = new URL(page.url()).origin; } catch { throw new ComponentIssue("wrong_origin","The page has no supported merchant origin."); }
    if (!policy.allowedOrigins.includes(origin)) throw new ComponentIssue("wrong_origin","The page left the origin permitted by this task.");
  }
  async function bounded<T>(work: () => Promise<T>): Promise<T> {
    checkContext();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    const interruption = new Promise<never>((_,reject) => {
      timer = setTimeout(() => { poisoned=true; void page.close().catch(()=>{}); reject(new ComponentIssue("timeout","Component operation reached its bounded timeout. No further actions were attempted.")); },controlTimeout);
      abort = () => { poisoned=true; void page.close().catch(()=>{}); reject(new ComponentIssue("cancelled","The owning browser worker cancelled this operation.")); };
      signal.addEventListener("abort",abort,{once:true});
    });
    try { return await Promise.race([work(),interruption]); }
    finally { if(timer)clearTimeout(timer); if(abort)signal.removeEventListener("abort",abort); }
  }
  async function run<T>(work: () => Promise<T>): Promise<T | ComponentFailure> {
    if(busy)return {ok:false,code:"busy",message:"Finish the current component operation before starting another."};
    busy=true;
    try { return await bounded(work); }
    catch(error) {
      const issue=error instanceof ComponentIssue?error:new ComponentIssue("interaction_failed","The component could not be inspected or changed. Rediscover before continuing.");
      return {ok:false,code:issue.code,message:issue.message,...(snapshot?{snapshot}:{})};
    } finally {busy=false;}
  }
  async function refresh(): Promise<ComponentSnapshot> {
    checkContext();
    const data: Inspection = await page.evaluate(({prefix,scanId,allowConsent})=>{
      // Methods keep this evaluated function self-contained under tsx/esbuild name preservation.
      const dom={
        visible(element:HTMLElement){return Boolean(element.getClientRects().length)&&getComputedStyle(element).visibility!=="hidden";},
        labelOf(element:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement){return ([...(element.labels??[])].map(label=>label.textContent).join(" ")||element.getAttribute("aria-label")||(element.getAttribute("aria-labelledby")||"").split(/\s+/).map(id=>document.getElementById(id)?.textContent||"").join(" ")||"").replace(/\s+/g," ").trim();}
      };
      const sensitive=/password|passcode|one[ -]?time|verification code|security code|\bcvv\b|\bcvc\b|\biban\b|\bssn\b|social security|card[ _-]?(number|holder)|credit[ _-]?card|debit[ _-]?card|bank[ _-]?account|routing[ _-]?number|payment|billing/i;
      const consentPattern=/\b(consent|agree|agreement|terms|subscribe|subscription|marketing|authorize|accept|privacy)\b/i;
      const controls:ObservedControl[]=[];
      const assignedTokens=new Set<string>();
      let excludedRequired=0;
      let truncated=false;
      const nodes=[...document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>("input,textarea,select")];
      for(const [index,element]of nodes.entries()){
        if(!dom.visible(element)||element.disabled||element.getAttribute("aria-disabled")==="true")continue;
        const label=dom.labelOf(element);
        const group=(element.closest("fieldset")?.querySelector("legend")?.textContent||"").replace(/\s+/g," ").trim();
        const required=element.required||element.getAttribute("aria-required")==="true";
        const type=element.tagName==="INPUT"?(element as HTMLInputElement).type:"";
        const autocomplete=element.getAttribute("autocomplete")||"";
        const consent=consentPattern.test(label+" "+group);
        const supported=element.tagName==="TEXTAREA"||element.tagName==="SELECT"||["text","search","url","number","radio","checkbox"].includes(type);
        if(!supported||!label||("readOnly"in element&&element.readOnly)||(element.tagName!=="SELECT"&&(element.getAttribute("role")==="combobox"||element.getAttribute("aria-haspopup")==="listbox"))||sensitive.test([label,group,element.id,element.name,autocomplete].join(" "))||/^(cc-|one-time-code|current-password|new-password)/i.test(autocomplete)||(consent&&!allowConsent)||(element.tagName==="SELECT"&&(element as HTMLSelectElement).multiple)){
          if(required)excludedRequired++;
          continue;
        }
        if(controls.length>=80){truncated=true;if(required)excludedRequired++;continue;}
        let token=element.getAttribute("data-oct3-control");
        if(!token?.startsWith(prefix+":")||assignedTokens.has(token)){token=prefix+":"+scanId+":"+index;element.setAttribute("data-oct3-control",token);}
        assignedTokens.add(token);
        const kind:ComponentKind=type==="radio"?"radio":type==="checkbox"?"checkbox":element.tagName==="SELECT"?"select":"text";
        const choice=kind==="radio"||kind==="checkbox";
        const allOptions=kind==="select"?[...(element as HTMLSelectElement).options].filter(option=>!option.disabled).map(option=>option.textContent?.replace(/\s+/g," ").trim()||""):[];
        const options=allOptions.slice(0,50);
        if(allOptions.length>50)truncated=true;
        const checked=choice&&(element as HTMLInputElement).checked;
        const peers=kind==="radio"?[...(element.form?.elements||document.querySelectorAll("input"))].filter(peer=>peer instanceof HTMLInputElement&&peer.type==="radio"&&peer.name===element.name&&peer.form===element.form) as HTMLInputElement[]:[];
        const selected=kind==="select"?(element as HTMLSelectElement).selectedOptions[0]:undefined;
        controls.push({control_id:token,id:element.id,label,kind,required,options,hasValue:choice?checked:Boolean(element.value)&&(kind!=="select"||!selected?.disabled),...(group?{group}:{}),group_has_value:kind==="radio"?peers.some(peer=>peer.checked):checked,consent,native_type:element.tagName==="INPUT"?type:element.tagName.toLowerCase(),valid:element.validity.valid,max_length:"maxLength"in element?element.maxLength:-1});
      }
      return {controls,excluded_required_count:excludedRequired,truncated};
    },{prefix,scanId:randomUUID(),allowConsent:policy.allowConsent===true});
    const nextFingerprint=createHash("sha256").update(JSON.stringify([page.url(),data.controls.map(({hasValue:_,group_has_value:__,valid:___,...field})=>field),data.excluded_required_count,data.truncated])).digest("hex");
    if(nextFingerprint!==fingerprint){
      if(revision>=3)throw new ComponentIssue("layout_limit","The form changed more than three inspection passes. Stop and replan through the owning worker.");
      revision++;fingerprint=nextFingerprint;planned=new Map();
      snapshot={snapshot_id:randomUUID(),task_id:policy.task_id,revision,observed_at:new Date().toISOString(),controls:[],excluded_required_count:data.excluded_required_count,truncated:data.truncated};
    }
    observed=data.controls;
    snapshot={...snapshot!,observed_at:new Date().toISOString(),controls:data.controls.map(({group_has_value:_,consent:__,max_length:___,valid:____,native_type:_____,...field})=>field),excluded_required_count:data.excluded_required_count,truncated:data.truncated};
    return snapshot;
  }
  async function current(expected:string) {
    if(!snapshot)throw new ComponentIssue("not_inspected","Inspect this task page before planning or filling fields.");
    await refresh();
    if(snapshot!.snapshot_id!==expected)throw new ComponentIssue("stale_snapshot","The observed form changed. Replan against the new snapshot before changing fields.");
    return snapshot!;
  }
  function permitted(field:ObservedControl) {
    return policy.readOnly===false && (!field.consent||policy.allowConsent===true) && (policy.allowedFields??[]).some(rule=>Boolean(rule.id||rule.label_exact)&&(!rule.id||rule.id===field.id)&&(!rule.label_exact||normalLabel(rule.label_exact)===field.label)&&(!rule.kind||rule.kind===field.kind));
  }
  function checkValue(field:ObservedControl,value:ComponentValue) {
    if(field.kind==="checkbox"||field.kind==="radio"){
      if(typeof value!=="boolean"||(field.kind==="radio"&&value!==true))throw new ComponentIssue("invalid_value","Checkboxes require an explicit boolean; a radio selection requires true.");
    }else{
      if(typeof value!=="string")throw new ComponentIssue("invalid_value","This component requires an explicit text or displayed option label.");
      if(value.length>4000||(field.max_length>=0&&value.length>field.max_length))throw new ComponentIssue("invalid_value","The supplied value exceeds this component's text limit; revise it explicitly.");
      if(field.kind==="select"&&field.options.filter(option=>option===value).length!==1)throw new ComponentIssue("missing_option","The requested option must uniquely match one observed displayed label.");
    }
  }
  function locatorFor(field:ObservedControl):Locator {return page.locator(`[data-oct3-control="${field.control_id}"]`);}
  async function retained(field:ObservedControl,value:ComponentValue):Promise<boolean>{
    const locator=locatorFor(field);
    if(await locator.count()!==1)throw new ComponentIssue("stale_control","The exact observed component is no longer unique.");
    // Read back only a boolean; current field contents never leave the browser.
    const result=await locator.evaluate((element,expected)=>{
      const input=element as HTMLInputElement;
      const label=([...(input.labels??[])].map(label=>label.textContent).join(" ")||element.getAttribute("aria-label")||(element.getAttribute("aria-labelledby")||"").split(/\s+/).map(id=>document.getElementById(id)?.textContent||"").join(" ")||"").replace(/\s+/g," ").trim();
      const kind=input.type==="checkbox"?"checkbox":input.type==="radio"?"radio":element.tagName==="SELECT"?"select":"text";
      const visible=!!element.getClientRects().length&&getComputedStyle(element).visibility!=="hidden";
      if(label!==expected.label||kind!==expected.kind||(element.tagName==="INPUT"?input.type:element.tagName.toLowerCase())!==expected.native_type||element.id!==expected.id||!visible||input.disabled||input.readOnly||element.getAttribute("aria-disabled")==="true")return {same:false,matches:false};
      const matches=kind==="checkbox"||kind==="radio"?input.checked===expected.value:kind==="select"?(element as HTMLSelectElement).selectedOptions[0]?.textContent?.replace(/\s+/g," ").trim()===expected.value:input.value===expected.value;
      return {same:true,matches};
    },{value,label:field.label,kind:field.kind,id:field.id,native_type:field.native_type});
    if(!result.same)throw new ComponentIssue("stale_control","This component's label, kind or visibility changed. Rediscover before interacting.");
    return result.matches;
  }
  const inspectTaskPage=()=>run(async()=>({ok:true as const,snapshot:await refresh()}));
  const planTaskFields=(input:{snapshot_id:string;fields:SuppliedField[]})=>run(async()=>{
    const currentSnapshot=await current(input.snapshot_id);
    if(input.fields.length>32)throw new ComponentIssue("invalid_value","Plan at most 32 explicit field values per task pass.");
    const selected=new Map<string,ComponentValue>();
    const ready:{control_id:string;label:string;kind:ComponentKind}[]=[];
    const missing:{label:string;reason:string}[]=[];
    const ambiguous:{label:string;reason:string}[]=[];
    const blocked:{control_id:string;label:string;reason:string}[]=[];
    for(const supplied of input.fields){
      const matches=observed.filter(field=>Boolean(supplied.control_id||supplied.id||supplied.label_exact)&&(!supplied.control_id||field.control_id===supplied.control_id)&&(!supplied.id||field.id===supplied.id)&&(!supplied.label_exact||field.label===normalLabel(supplied.label_exact)));
      const label=supplied.label_exact||supplied.id||supplied.control_id||"Unspecified field";
      if(!matches.length){missing.push({label,reason:"No current observed component matches this exact target."});continue;}
      if(matches.length!==1){ambiguous.push({label,reason:"Multiple observed components match; use the unique control_id."});continue;}
      const field=matches[0];
      if(!permitted(field)){blocked.push({control_id:field.control_id,label:field.label,reason:"Trusted task policy does not allow changing this component."});continue;}
      try{checkValue(field,supplied.value);}catch(error){blocked.push({control_id:field.control_id,label:field.label,reason:error instanceof ComponentIssue?error.message:"Unsupported value."});continue;}
      if(selected.has(field.control_id)&&selected.get(field.control_id)!==supplied.value){selected.delete(field.control_id);ambiguous.push({label:field.label,reason:"Conflicting explicit values target this component."});continue;}
      selected.set(field.control_id,supplied.value);
    }
    for(const [controlId]of selected){if(ambiguous.some(item=>item.label===observed.find(field=>field.control_id===controlId)?.label))continue;const field=observed.find(field=>field.control_id===controlId)!;ready.push({control_id:field.control_id,label:field.label,kind:field.kind});}
    planned=new Map(ready.map(field=>[field.control_id,selected.get(field.control_id)!]));
    return {ok:true as const,snapshot_id:currentSnapshot.snapshot_id,planned:ready,missing,ambiguous,blocked};
  });
  const fillTaskComponent=(input:{snapshot_id:string;control_id:string;value:ComponentValue})=>run(async()=>{
    const before=await current(input.snapshot_id);
    const field=observed.find(field=>field.control_id===input.control_id);
    if(!field)throw new ComponentIssue("stale_control","Rediscover this missing component before filling it.");
    if(!permitted(field))throw new ComponentIssue("field_not_allowed","Trusted task policy does not allow this preparatory field.");
    if(!planned.has(field.control_id)||planned.get(field.control_id)!==input.value)throw new ComponentIssue("value_not_planned","Plan this exact field and value against the current snapshot first.");
    checkValue(field,input.value);
    if(await retained(field,input.value))return {ok:true as const,control_id:field.control_id,verified:true,changed:false,snapshot:before,replan_required:false};
    if(mutations>=32)throw new ComponentIssue("layout_limit","The bounded component action budget has been reached.");
    mutations++;
    let attempts=0;
    for(;attempts<2;attempts++){
      checkContext();
      const locator=locatorFor(field);
      try{
        if(field.kind==="checkbox")await locator.setChecked(input.value as boolean,{timeout:2000});
        else if(field.kind==="radio")await locator.check({timeout:2000});
        else if(field.kind==="select")await locator.selectOption({label:input.value as string},{timeout:2000});
        else {await locator.fill(input.value as string,{timeout:2000});await locator.blur({timeout:1000});}
      }catch(error){
        checkContext();
        const after=await refresh();
        if(after.snapshot_id!==before.snapshot_id)throw new ComponentIssue("stale_snapshot","The form changed during interaction. Replan before another action.");
        if(await retained(field,input.value))break;
        if(attempts===0&&error instanceof Error&&error.name==="TimeoutError")continue; // One precommit retry only after unchanged-layout readback.
        throw new ComponentIssue("interaction_failed","This component interaction failed after readback; no blind repeat was attempted.");
      }
      if(!await retained(field,input.value))throw new ComponentIssue("value_not_retained","The page did not retain the requested value. Inspect before revising it.");
      break;
    }
    const after=await refresh();
    return {ok:true as const,control_id:field.control_id,verified:true,changed:true,attempts:attempts+1,snapshot:after,replan_required:after.snapshot_id!==before.snapshot_id};
  });
  const verifyPreparedTask=(input:{snapshot_id:string})=>run(async()=>{
    const currentSnapshot=await current(input.snapshot_id);
    const remaining=observed.filter(field=>(field.required&&!(field.kind==="radio"?field.group_has_value:field.hasValue))||!field.valid).map(field=>({control_id:field.control_id,label:field.label,kind:field.kind}));
    const readback: {control_id:string;matches:boolean}[]=[];
    for(const [controlId,value]of planned){const field=observed.find(item=>item.control_id===controlId);readback.push({control_id:controlId,matches:!!field&&await retained(field,value)});}
    return {ok:true as const,snapshot:currentSnapshot,fields_ready:observed.length>0&&!remaining.length&&!currentSnapshot.excluded_required_count&&!currentSnapshot.truncated&&readback.every(item=>item.matches),remaining,readback,checkout_ready:false,purchase_confirmed:false,reason:"This verifies observed preparatory fields only. Merchant totals, approval and confirmation remain separate."};
  });
  return {inspectTaskPage,planTaskFields,fillTaskComponent,verifyPreparedTask};
}
export type ComponentToolkit = ReturnType<typeof createComponentToolkit>;
