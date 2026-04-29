// SDK version info — extracted from package.json dependencies
// Vite supports JSON imports natively
import pkg from '../../package.json';

const stripCaret = (v?: string) => (v ?? '').replace(/^[\^~]/, '');

export const SDK_VERSIONS = {
  planetKit: stripCaret(pkg.dependencies['@line/planet-kit']),
  virtualBackground: stripCaret(pkg.dependencies['@line/planet-kit-virtual-background']),
};
