import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.radio.nocturne',
  appName: 'Radio Nocturne',
  webDir: 'dist',
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library',
      androidIsEncryption: false,
    },
  },
};

export default config;
