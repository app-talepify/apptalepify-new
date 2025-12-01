import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';
import './src/firebase'; // Firebase'i en başta initialize et

import { AppRegistry, LogBox } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

// Dev log noise cleanup: ignore known non-blocking warnings only in development
if (__DEV__) {
  LogBox.ignoreLogs([
    // NativeEventEmitter addListener/removeListeners noise from third-party modules
    'new NativeEventEmitter() was called with a non-null argument without the required `addListener` method.',
    'new NativeEventEmitter() was called with a non-null argument without the required `removeListeners` method.',
    // React Native Firebase namespaced API deprecation notices (v22 migration planned)
    'This method is deprecated (as well as all React Native Firebase namespaced API) and will be removed in the next major release',
    // iOS image resolver noise (Mapbox/native): harmless, suppress in dev fully
    'Could not find image file',
    'default-logo.png',
  ]);
}

AppRegistry.registerComponent(appName, () => App);
