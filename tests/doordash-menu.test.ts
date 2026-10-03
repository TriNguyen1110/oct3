import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDoorDashRows } from "../src/browser/doordash";

test("DoorDash menu parsing keeps grounded boba cards and rejects fee rows", () => {
  const options = parseDoorDashRows([
    { title: "Classic Black", price: "$6.90", context: "Boba Guys pickup boba milk tea 98% (267)" },
    { title: "Delivery fee", price: "$3.99", context: "DashPass" },
    { title: "No readable price", price: "From $8", context: "boba" },
  ], "boba milk tea");
  assert.deepEqual(options, [{ title: "Classic Black", unit_minor: 690, context: "Boba Guys pickup boba milk tea 98% (267)", score: 3 }]);
});
