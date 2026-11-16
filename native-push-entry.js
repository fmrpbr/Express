import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { registerPlugin } from "@capacitor/core";
import { NativeSettings } from "capacitor-native-settings";
import { Share } from "@capacitor/share";
const BackgroundGeolocation = registerPlugin("BackgroundGeolocation");
const NotificationSettings = registerPlugin("ExpressNotifications");
window.ExpressNativePush = { NotificationSettings, PushNotifications, LocalNotifications, NativeSettings, BackgroundGeolocation, Share };
