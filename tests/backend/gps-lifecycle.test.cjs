const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

const html = fs.readFileSync(require('node:path').join(__dirname, '../../www/index.html'), 'utf8');
const source = html.slice(html.indexOf('  async function startGpsTracking('), html.indexOf('  function createTrackingToken('));
function harness(overrides = {}) {
  const calls = [], removed = [], storage = new Map();
  const background = {
    async addWatcher(options, callback) { calls.push({ options, callback }); return 'watcher-1'; },
    async removeWatcher(value) { removed.push(value.id); },
    ...overrides.background
  };
  const push = {
    async checkPermissions() { return { receive: 'granted' }; },
    async requestPermissions() { return { receive: 'denied' }; },
    ...overrides.push
  };
  const context = vm.createContext({
    window: { Capacitor: { isNativePlatform: () => true }, ExpressNativePush: { BackgroundGeolocation: background, PushNotifications: push } },
    document: { visibilityState: 'visible' }, navigator: {},
    trackingOrderId: null, nativeGpsWatcher: null, watchId: null,
    gpsGeneration: 0, gpsBlockedOrderId: null, gpsErrorShown: false,
    lastGpsWriteAt: 0, lastGpsCoords: null, gpsWriteInFlight: false,
    currentUser: { uid: 'courier' }, data: { orders: [{ id: 'ride', status: 'run', courierId: 'courier' }] },
    localStorage: { setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) },
    toast() {}, command: async () => {}, gpsDistanceMeters: () => 100, Date,
  });
  vm.runInContext(source, context);
  return { context, calls, removed, storage };
}

test('repeated active-order updates create only one native watcher', async () => {
  const h = harness();
  await Promise.all([h.context.startGpsTracking('ride'), h.context.startGpsTracking('ride')]);
  assert.equal(h.calls.length, 1);
  assert.equal(h.context.nativeGpsWatcher, 'watcher-1');
  assert.equal(h.storage.size, 0);
});
test('logout during notification permission check never starts the GPS service', async () => {
  let resolve;
  const h = harness({ push: { checkPermissions: () => new Promise(r => { resolve = r; }) } });
  const start = h.context.startGpsTracking('ride');
  h.context.stopGpsTracking(); h.context.currentUser = null;
  resolve({ receive: 'granted' }); await start;
  assert.equal(h.calls.length, 0);
  assert.equal(h.context.trackingOrderId, null);
});
test('denied notification permission pauses GPS without repeatedly asking on database updates', async () => {
  let requests = 0;
  const h = harness({ push: {
    checkPermissions: async () => ({ receive: 'prompt' }),
    requestPermissions: async () => { requests++; return { receive: 'denied' }; }
  } });
  await h.context.startGpsTracking('ride');
  await h.context.startGpsTracking('ride');
  assert.equal(requests, 1);
  assert.equal(h.calls.length, 0);
  assert.equal(h.context.gpsBlockedOrderId, 'ride');
});
test('native watcher resolving after logout is removed instead of retained', async () => {
  let resolve, began;
  const ready = new Promise(r => { began = r; });
  const h = harness({ background: { addWatcher: () => new Promise(r => { resolve = r; began(); }) } });
  const start = h.context.startGpsTracking('ride');
  await ready;
  assert.equal(h.storage.get('express_gps_start_pending'), '1');
  h.context.stopGpsTracking();
  resolve('late-watcher'); await start;
  assert.deepEqual(h.removed, ['late-watcher']);
  assert.equal(h.context.nativeGpsWatcher, null);
});
test('a rejected native start is paused and does not create a crash-restart loop', async () => {
  let attempts = 0;
  const h = harness({ background: { addWatcher: async () => { attempts++; throw { code: 'GPS_START_FAILED' }; } } });
  await h.context.startGpsTracking('ride');
  await h.context.startGpsTracking('ride');
  assert.equal(attempts, 1);
  assert.equal(h.context.gpsBlockedOrderId, 'ride');
  assert.equal(h.storage.size, 0);
});
test('backgrounded app does not attempt to start a while-in-use location service', async () => {
  const h = harness(); h.context.document.visibilityState = 'hidden';
  await h.context.startGpsTracking('ride');
  assert.equal(h.calls.length, 0);
  assert.equal(h.context.gpsBlockedOrderId, 'ride');
});
