import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { registerPlugin } from "@capacitor/core";
import { NativeSettings } from "capacitor-native-settings";
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
window.ExpressNativePush = { PushNotifications, LocalNotifications, NativeSettings, BackgroundGeolocation };
