export function slotsToMap(slots) {
  const out = {};
  for (const slot of slots) {
    out[slot.slot_name] = slot.slot_value;
  }
  return out;
}

export function missingRequiredSlots(requiredSlots, collectedSlotsMap) {
  return requiredSlots.filter((slot) => {
    const v = collectedSlotsMap[slot];
    return v === undefined || v === null || String(v).trim() === "";
  });
}
