# FrameFlow

AI video editor for creators.

Built with [Expo](https://expo.dev) (SDK 57) · React Native 0.86 · TypeScript · Expo Router.

## Getting started

```bash
npm install
npx expo start
```

Then press `i` for the iOS simulator, `a` for an Android emulator, or scan the QR code with Expo Go.

Once we add libraries with custom native code (camera, video processing, etc.), Expo Go won't be enough. Use a development build instead:

```bash
npx expo run:ios      # or: npx expo run:android
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Start the Metro dev server |
| `npm run ios` / `android` / `web` | Start and open on a platform |
| `npm run lint` | ESLint via `expo lint` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run reset-project` | Move the starter screens to `app-example/` and start from a blank `src/app` |

Add dependencies with `npx expo install <package>` so versions match the Expo SDK.

## Project structure

```
src/
  app/          # Routes (Expo Router): every file is a screen, _layout.tsx defines navigators
  components/   # Shared UI components
  constants/    # Theme and other constants
  hooks/        # Shared hooks
assets/         # Images, icons, fonts
```

`ios/` and `android/` are generated on demand (Continuous Native Generation) and are gitignored. Configure native behavior through `app.json` and config plugins.
