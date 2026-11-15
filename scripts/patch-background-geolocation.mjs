import { readFile, writeFile } from 'node:fs/promises';

// The package is pinned. Fail the build if its sources change instead of silently
// applying a partial permission fix to another release.
const root = 'node_modules/@capacitor-community/background-geolocation';
export function patchPlugin(source) {
  if (source.includes('// Express: permission must finish before creating a watcher.')) return source;
  const old = `                requestPermissionForAlias("location", call, "locationPermissionsCallback");
            } else {
                call.reject("Permission denied.", "NOT_AUTHORIZED");
            }
        } else if (!isLocationEnabled(getContext())) {
            call.reject("Location services disabled.", "NOT_AUTHORIZED");
        }`;
  const fixed = `                requestPermissionForAlias("location", call, "locationPermissionsCallback");
            } else {
                call.reject("Permission denied.", "NOT_AUTHORIZED");
            }
            // Express: permission must finish before creating a watcher.
            return;
        } else if (!isLocationEnabled(getContext())) {
            call.reject("Location services disabled.", "NOT_AUTHORIZED");
            return;
        }`;
  const callback = `        if (call.getBoolean("stale", false)) {
            fetchLastLocation(call);
        }
        if (service != null) {
            service.onPermissionsGranted();
            // The handleOnResume method will now be called, and we don't need it to call
            // service.onPermissionsGranted again so we reset this flag.
            stoppedWithoutPermissions = false;
        }`;
  if (!source.includes(old) || !source.includes(callback)) throw new Error('Plugin GPS mudou: revisar correção de permissões.');
  source = source.replace(old, fixed).replace(callback, `        // Resume the saved call only after Android granted location permission.
        stoppedWithoutPermissions = false;
        addWatcher(call);`);
  source = source.replace('        service.addWatcher(\n', '        try {\n        service.addWatcher(\n').replace('            call.getFloat("distanceFilter", 0f)\n        );', `            call.getFloat("distanceFilter", 0f)
        );
        } catch (RuntimeException error) {
            service.removeWatcher(call.getCallbackId());
            call.reject("Unable to start location service", "GPS_START_FAILED", error);
        }`);
  source = source.replace('        service.removeWatcher(callbackId);', '        if (service != null) service.removeWatcher(callbackId);');
  return source;
}

export async function patchBackgroundGeolocation() {
  const pkg = JSON.parse(await readFile(root + '/package.json', 'utf8'));
  if (pkg.version !== '1.3.1') throw new Error('Revisar patch GPS para a nova versão.');
  const dir = root + '/android/src/main/java/com/equimaps/capacitor_background_geolocation/';
  const plugin = dir + 'BackgroundGeolocation.java';
  await writeFile(plugin, patchPlugin(await readFile(plugin, 'utf8')));
  const service = dir + 'BackgroundGeolocationService.java';
  let source = await readFile(service, 'utf8');
  if (!source.includes('if (locationResult == null) return;')) source = source.replace('                    Location location = locationResult.getLastLocation();', '                    if (locationResult == null) return;\n                    Location location = locationResult.getLastLocation();\n                    if (location == null) return;');
  // A revoked while-in-use permission must not crash handleOnResume.
  const resume = `                watcher.client.requestLocationUpdates(
                        watcher.locationRequest,
                        watcher.locationCallback,
                        null
                );`;
  if (!source.includes('// Express: permission can be revoked in Settings.')) {
    const index = source.indexOf('        void onPermissionsGranted()');
    if (index < 0 || !source.slice(index).includes(resume)) throw new Error('Revisar retomada do GPS.');
    source = source.slice(0, index) + source.slice(index).replace(resume,
      `                // Express: permission can be revoked in Settings.\n                try {\n${resume}\n                } catch (SecurityException denied) {\n                    Logger.error("Location permission revoked", denied);\n                    continue;\n                }`);
  }
  await writeFile(service, source);
}
