(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ExpressPlatformAlerts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const minute = 60000;
  const closed = new Set(['completed', 'cancelled']);
  const needsCall = order => order.externalOrder?.stage === 'ready' && order.externalOrder.fulfillment === 'merchant' &&
    !order.externalOrder.dispatchId && order.status === 'external';

  function create() {
    const known = new Set();
    const reminders = new Map();
    let initialized = false;
    return {
      update(orders, now) {
        const active = new Set();
        const received = [];
        const ready = [];
        for (const order of orders) {
          if (!order.externalOrder?.stage) continue;
          if (initialized && !known.has(order.id) && !closed.has(order.externalOrder.stage)) received.push(order);
          known.add(order.id);
          if (!needsCall(order)) continue;
          active.add(order.id);
          if (!reminders.has(order.id)) {
            if (initialized) ready.push(order);
            reminders.set(order.id, now + minute);
          }
        }
        for (const id of reminders.keys()) if (!active.has(id)) reminders.delete(id);
        initialized = true;
        return { received, ready };
      },
      due(orders, now) {
        const due = orders.filter(order => needsCall(order) && (reminders.get(order.id) ?? Infinity) <= now);
        for (const order of due) reminders.set(order.id, now + minute);
        return due;
      },
    };
  }

  return { create, needsCall };
});
