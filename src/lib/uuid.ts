import { v4 as uuidv4 } from 'uuid';

// react-native-get-random-values polyfills crypto.getRandomValues on Hermes,
// which `uuid` needs. Node already provides it, so we only pull the polyfill in
// when it's missing — importing it under Node (tsx/e2e) would crash on `require`.
if (typeof globalThis.crypto?.getRandomValues !== 'function') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-get-random-values');
}

export function newUuid(): string {
  return uuidv4();
}
