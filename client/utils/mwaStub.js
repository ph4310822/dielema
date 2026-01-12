// Stub module for Mobile Wallet Adapter when running in Expo Go
// This prevents the native module error while allowing the app to run

console.log('[MWA Stub] Mobile Wallet Adapter is not available in Expo Go');

// Export stub functions that throw helpful errors
const notAvailableError = () => {
  throw new Error(
    'Mobile Wallet Adapter is not available in Expo Go.\n\n' +
    'To use this feature:\n' +
    '• Create a development build: npx expo run:android\n' +
    '• Or test wallet connection on web: npx expo start --web'
  );
};

module.exports = {
  transact: notAvailableError,
  Web3MobileWallet: null,
  __isMwaStub: true, // Marker to identify this is a stub, not the real module
};
