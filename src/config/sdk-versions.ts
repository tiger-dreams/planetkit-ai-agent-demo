// SDK 버전 정보 - package.json의 dependencies에서 추출
// Vite는 JSON import를 자동 지원
import pkg from '../../package.json';

const stripCaret = (v?: string) => (v ?? '').replace(/^[\^~]/, '');

export const SDK_VERSIONS = {
  planetKit: stripCaret(pkg.dependencies['@line/planet-kit']),
  virtualBackground: stripCaret(pkg.dependencies['@line/planet-kit-virtual-background']),
};
