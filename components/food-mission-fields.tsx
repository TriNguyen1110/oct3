import type { MissionInput } from "@/src/shared/contracts";

type FoodRequest = NonNullable<MissionInput["requirements"]["food"]>;
export const defaultFoodRequest: FoodRequest = { query: "boba milk tea", fulfillment: "pickup", location: "580 20th Street, San Francisco", quantity: 1 };

export function FoodMissionFields({ value, onChange }: { value: FoodRequest | undefined; onChange: (value: FoodRequest | undefined) => void }) {
  return <fieldset className="food-request"><legend>Food &amp; supplies</legend>
    <label className="food-toggle"><input type="checkbox" checked={!!value} onChange={event => onChange(event.target.checked ? { ...defaultFoodRequest } : undefined)}/><span>Find food for this mission</span></label>
    {value && <><label className="field">What sounds good?<input value={value.query} onChange={event => onChange({ ...value, query: event.target.value })} required placeholder="Boba milk tea"/></label>
      <div className="form-row"><label className="field">Fulfillment<select aria-label="Fulfillment" value={value.fulfillment} onChange={event => onChange({ ...value, fulfillment: event.target.value as FoodRequest["fulfillment"] })}><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></label><label className="field">Quantity<input type="number" min="1" max="50" value={value.quantity} onChange={event => onChange({ ...value, quantity: Number(event.target.value) })} required/></label></div>
      <label className="field">Search near<input value={value.location} onChange={event => onChange({ ...value, location: event.target.value })} required placeholder="Neighborhood or street address"/></label>
      <p className="field-hint">Boba pickup research near 580 20th Street, San Francisco. The current worker supports one drink from Boba Guys’ official pickup site. Menu prices are estimates; availability, taxes and fees need checkout verification. No food order is placed.</p>
    </>}
  </fieldset>;
}
