# Tailor St iOS App Guide

## What is already set up

- Capacitor is installed.
- The iOS project lives in `ios/App`.
- The app name is `Tailor St`.
- The bundle ID is `com.raphaelle1216.tailorst`.
- The app icon uses the Tailor St logo.
- The iOS bundle is synced with the production React build.

## After changing website code

Run:

```bash
npm run ios:sync
```

This rebuilds the React app and copies the newest files into the iOS app.

## Open the app in Xcode

Install full Xcode from the Mac App Store first. Then run:

```bash
npm run ios:open
```

In Xcode:

1. Click the `App` project.
2. Select the `App` target.
3. Open `Signing & Capabilities`.
4. Choose your Apple Developer Team.
5. Confirm the Bundle Identifier is `com.raphaelle1216.tailorst`.
6. Pick an iPhone Simulator.
7. Press the Play button.

## TestFlight and App Store

When the app works in the simulator:

1. In Xcode, select `Any iOS Device`.
2. Choose `Product > Archive`.
3. In Organizer, choose `Distribute App`.
4. Upload to App Store Connect.
5. In App Store Connect, add screenshots, description, support URL, privacy policy URL, and privacy details.
6. Test with TestFlight.
7. Submit for App Review.

## App Store notes

Apple may reject apps that feel like a plain website wrapper. Before final submission, add app-specific polish such as a native splash screen, strong mobile spacing, clean empty states, and a real support/privacy page.
