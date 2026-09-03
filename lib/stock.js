function normalizeQuantity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getAvailabilityStatus(quantity) {
  const qty = normalizeQuantity(quantity);
  if (qty > 10) return 'available';
  if (qty > 0) return 'low_stock';
  return 'out_of_stock';
}

function getItemAvailability(item, now = new Date()) {
  const quantity = item?.availableQuantity === undefined || item?.availableQuantity === null
    ? normalizeQuantity(item?.limitedQuantity ?? 15)
    : normalizeQuantity(item.availableQuantity);

  const scheduledUntil = item?.stockScheduledUntil ? new Date(item.stockScheduledUntil) : null;
  const isScheduledOut = Boolean(scheduledUntil && scheduledUntil > now);
  const computedStatus = isScheduledOut ? 'out_of_stock' : getAvailabilityStatus(quantity);

  return {
    availableQuantity: quantity,
    availabilityStatus: computedStatus,
    isScheduledOut,
    scheduledUntil
  };
}

function applyAvailabilityToItem(item, now = new Date()) {
  const itemAvailability = getItemAvailability(item, now);
  return {
    ...item,
    availableQuantity: itemAvailability.availableQuantity,
    availabilityStatus: itemAvailability.availabilityStatus,
    stockScheduledUntil: item?.stockScheduledUntil || null,
  };
}

function isItemOrderable(item, qty = 1) {
  const availability = getItemAvailability(item);
  return availability.availabilityStatus !== 'out_of_stock' && availability.availableQuantity >= normalizeQuantity(qty);
}

module.exports = {
  getAvailabilityStatus,
  getItemAvailability,
  applyAvailabilityToItem,
  isItemOrderable,
};
