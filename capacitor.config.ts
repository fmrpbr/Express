import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fmrpbr.express.v2',
  appName: 'Express',
  webDir: 'www',
  android: {
    backgroundColor: '#ffffff',
    useLegacyBridge: true
  },
  plugins: {
    CapacitorHttp: { enabled: true },
    LocalNotifications: { smallIcon: 'ic_express_notification', iconColor: '#EA1D2C', sound: 'express_alert.wav' },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    }
  }
};

export default config;
