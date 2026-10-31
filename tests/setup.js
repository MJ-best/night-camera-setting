// Node 테스트에서 브라우저처럼 Astronomy 전역을 준비한다
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.Astronomy = require('../vendor/astronomy.browser.min.js');
