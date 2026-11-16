import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isNativeApp, nativePlatform, getPlugin, hideSplashScreen, syncStatusBar, hapticTap, registerBackHandler,
} from '../js/native.js';
import { Compass, compassSupported, defaultDeclination } from '../js/compass.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('웹/Node 환경에서 네이티브 브리지 폴백이 안전하게 동작한다', async () => {
  const prev = globalThis.Capacitor;
  delete globalThis.Capacitor;
  try {
    assert.equal(isNativeApp(), false);
    assert.equal(nativePlatform(), 'web');
    assert.equal(getPlugin('Compass'), null);
    await hideSplashScreen();
    await syncStatusBar('red');
    await hapticTap('LIGHT');
    const unsub = registerBackHandler(() => false);
    assert.equal(typeof unsub, 'function');
    unsub();
  } finally {
    if (prev !== undefined) globalThis.Capacitor = prev;
  }
});

test('네이티브 Capacitor 브리지에서 상태바·햅틱·뒤로가기·나침반이 동작한다', async () => {
  const prev = globalThis.Capacitor;
  const calls = [];
  let listenerCb = null;
  let removed = false;
  let exitCount = 0;
  let backCb = null;

  globalThis.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {
      StatusBar: {
        setStyle: (v) => calls.push(['setStyle', v]),
        setBackgroundColor: (v) => calls.push(['setBackgroundColor', v]),
      },
      Haptics: {
        impact: (v) => calls.push(['impact', v]),
      },
      App: {
        addListener: (name, cb) => {
          if (name === 'backButton') backCb = cb;
          return { remove: async () => {} };
        },
        exitApp: () => { exitCount += 1; },
      },
      Compass: {
        addListener: async (ev, cb) => {
          assert.equal(ev, 'heading');
          listenerCb = cb;
          return { remove: async () => { removed = true; } };
        },
        start: async () => calls.push(['compassStart']),
        stop: async () => calls.push(['compassStop']),
      },
    },
  };

  try {
    assert.equal(isNativeApp(), true);
    assert.equal(nativePlatform(), 'android');
    assert.equal(compassSupported(), true);

    await syncStatusBar('red');
    await syncStatusBar('green');
    assert.deepEqual(calls.slice(0, 4), [
      ['setStyle', { style: 'DARK' }],
      ['setBackgroundColor', { color: '#1a0204' }],
      ['setStyle', { style: 'DARK' }],
      ['setBackgroundColor', { color: '#021705' }],
    ]);

    await hapticTap('MEDIUM');
    assert.deepEqual(calls[4], ['impact', { style: 'MEDIUM' }]);

    let page = 2;
    const unsub = registerBackHandler(() => {
      if (page > 0) { page -= 1; return true; }
      return false;
    });
    await backCb();
    assert.equal(page, 1);
    assert.equal(exitCount, 0);
    page = 0;
    await backCb();
    assert.equal(exitCount, 1);
    unsub();

    const headings = [];
    const compass = new Compass((h) => headings.push(h));
    await compass.start();
    assert.equal(compass.active, true);
    listenerCb({ magneticHeading: 400 });
    listenerCb({ magneticHeading: -15 });
    assert.deepEqual(headings, [40, 345]);
    await compass.stop();
    assert.equal(compass.active, false);
    assert.equal(removed, true);
  } finally {
    if (prev !== undefined) globalThis.Capacitor = prev;
    else delete globalThis.Capacitor;
  }
});

test('한국 자기 편각 기본값', () => {
  assert.equal(defaultDeclination(37.5665, 126.978), -8.5);
  assert.equal(defaultDeclination(28.7, -17.9), 0);
});

test('서비스 워커 캐시 목록, 매니페스트, 테마 일러스트, 네이티브 프로젝트 파일이 모두 존재한다', () => {
  const swText = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const m = swText.match(/const APP_FILES = \[([\s\S]*?)\];/);
  assert.ok(m, 'sw.js에 APP_FILES 목록이 있어야 한다');
  const files = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((f) => f !== './');
  assert.ok(files.includes('privacy.html'));
  assert.ok(files.includes('js/native.js'));
  assert.ok(files.includes('vendor/capacitor.js'));
  for (const rel of files) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `누락된 SW 캐시 파일: ${rel}`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const icon of manifest.icons) {
    assert.ok(fs.existsSync(path.join(ROOT, icon.src)), `누락된 매니페스트 아이콘: ${icon.src}`);
  }

  for (const t of ['milkyway', 'moon', 'startrails', 'meteor', 'planets', 'city']) {
    assert.ok(fs.existsSync(path.join(ROOT, `assets/targets/${t}.webp`)), `누락된 대상 일러스트: ${t}`);
  }

  const capConfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  assert.equal(capConfig.appId, 'com.mjbest.nightskyshot');
  assert.equal(capConfig.webDir, 'www');

  for (const rel of [
    'android/app/src/main/java/com/mjbest/nightskyshot/MainActivity.java',
    'android/app/src/main/java/com/mjbest/nightskyshot/CompassPlugin.java',
    'android/app/src/main/AndroidManifest.xml',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png',
    'android/app/src/main/res/mipmap-xxhdpi/ic_launcher_background.png',
    'ios/App/App/AppViewController.swift',
    'ios/App/App/CompassPlugin.swift',
    'ios/App/App/SceneDelegate.swift',
    'ios/App/App/Info.plist',
    'ios/App/App/ko.lproj/InfoPlist.strings',
    'ios/App/App/en.lproj/InfoPlist.strings',
    'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',
    'store-assets/app-store/app-icon-1024x1024.png',
    'store-assets/google-play/app-icon-512x512.png',
    'store-assets/google-play/feature-graphic-1024x500.png',
  ]) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `누락된 모바일/스토어 파일: ${rel}`);
  }
});
