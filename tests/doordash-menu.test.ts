import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMenuRows } from "../src/browser/food-choice";

test("menu parsing keeps observed items in page order, reads prices and rejects fee rows", () => {
  const items = parseMenuRows([
    { title: "Classic Black", price: "$6.90", context: "Black milk tea 98% (267)" },
    { title: "Delivery fee", price: "$3.99", context: "DashPass" },
    { title: "Jasmine Green", price: "$5.50", context: "Green milk tea" },
    { title: "No readable price", price: "From $8", context: "boba" },
  ]);
  assert.deepEqual(items, [
    { title: "Classic Black", unit_minor: 690, context: "Black milk tea 98% (267)" },
    { title: "Jasmine Green", unit_minor: 550, context: "Green milk tea" },
    { title: "No readable price", unit_minor: null, context: "boba" },
  ]);
});
