import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fmrpbr.express',
  appName: 'Express Entregas',
  webDir: 'www',
  server: {
    // O aplicativo abre a versão publicada no GitHub Pages.
    // Assim, as atualizações do sistema continuam disponíveis sem reinstalar o APK.
    url: 'https://fmrpbr.github.io/Express/',
    cleartext: false
  },
  android: {
    backgroundColor: '#ffffff'
  }
};

export default config;
