// Allow side-effect imports of global CSS (used for web font variables in
// constants/theme.ts). Expo also declares this via expo-env.d.ts once the dev
// server has run, but this keeps `tsc --noEmit` green from a clean checkout.
declare module '*.css';
