import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.fashioncentre.app',
  appName: 'Fashion Centre',
  webDir: 'dist',
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#faf8ff',
  },
};

export default config;