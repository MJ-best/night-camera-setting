// 정적 천문 데이터: 밝은 별(J2000), 별자리 선, 유성우, 은하수 영역, 별자리 한글 이름

const hms = (h, m, s) => h + m / 60 + s / 3600;
const dms = (d, m, s = 0) => {
  const sign = d < 0 || Object.is(d, -0) ? -1 : 1;
  return sign * (Math.abs(d) + m / 60 + s / 3600);
};

// [키, 한글 이름(없으면 null), RA(h), Dec(°), 등급, 색(b 청백, w 백, y 황백, o 주황, r 적)]
const RAW_STARS = [
  // 큰곰 (북두칠성)
  ['dubhe', '두베', hms(11, 3, 43.7), dms(61, 45, 3), 1.79, 'o'],
  ['merak', '메라크', hms(11, 1, 50.5), dms(56, 22, 57), 2.37, 'w'],
  ['phecda', null, hms(11, 53, 49.8), dms(53, 41, 41), 2.44, 'w'],
  ['megrez', null, hms(12, 15, 25.6), dms(57, 1, 57), 3.31, 'w'],
  ['alioth', null, hms(12, 54, 1.7), dms(55, 57, 35), 1.77, 'w'],
  ['mizar', null, hms(13, 23, 55.5), dms(54, 55, 31), 2.04, 'w'],
  ['alkaid', null, hms(13, 47, 32.4), dms(49, 18, 48), 1.86, 'b'],
  // 작은곰
  ['polaris', '북극성', hms(2, 31, 49.1), dms(89, 15, 51), 1.98, 'y'],
  ['yildun', null, hms(17, 32, 13.0), dms(86, 35, 11), 4.35, 'w'],
  ['epsUMi', null, hms(16, 45, 58.2), dms(82, 2, 14), 4.2, 'y'],
  ['zetaUMi', null, hms(15, 44, 3.5), dms(77, 47, 40), 4.3, 'w'],
  ['kochab', '코카브', hms(14, 50, 42.3), dms(74, 9, 20), 2.08, 'o'],
  ['pherkad', null, hms(15, 20, 43.7), dms(71, 50, 2), 3.05, 'w'],
  ['etaUMi', null, hms(16, 17, 30.3), dms(75, 45, 19), 4.95, 'w'],
  // 카시오페이아
  ['caph', null, hms(0, 9, 10.7), dms(59, 8, 59), 2.27, 'w'],
  ['schedar', '셰다르', hms(0, 40, 30.4), dms(56, 32, 14), 2.24, 'o'],
  ['gammaCas', null, hms(0, 56, 42.5), dms(60, 43, 0), 2.47, 'b'],
  ['ruchbah', null, hms(1, 25, 49.0), dms(60, 14, 7), 2.68, 'w'],
  ['segin', null, hms(1, 54, 23.7), dms(63, 40, 12), 3.37, 'b'],
  // 오리온
  ['betelgeuse', '베텔게우스', hms(5, 55, 10.3), dms(7, 24, 25), 0.5, 'r'],
  ['rigel', '리겔', hms(5, 14, 32.3), dms(-8, 12, 6), 0.13, 'b'],
  ['bellatrix', null, hms(5, 25, 7.9), dms(6, 20, 59), 1.64, 'b'],
  ['mintaka', null, hms(5, 32, 0.4), dms(-0, 17, 57), 2.23, 'b'],
  ['alnilam', null, hms(5, 36, 12.8), dms(-1, 12, 7), 1.69, 'b'],
  ['alnitak', null, hms(5, 40, 45.5), dms(-1, 56, 34), 1.77, 'b'],
  ['saiph', null, hms(5, 47, 45.4), dms(-9, 40, 11), 2.09, 'b'],
  ['meissa', null, hms(5, 35, 8.3), dms(9, 56, 3), 3.33, 'b'],
  // 큰개 · 작은개
  ['sirius', '시리우스', hms(6, 45, 8.9), dms(-16, 42, 58), -1.46, 'w'],
  ['mirzam', null, hms(6, 22, 42.0), dms(-17, 57, 21), 1.98, 'b'],
  ['adhara', null, hms(6, 58, 37.5), dms(-28, 58, 20), 1.5, 'b'],
  ['wezen', null, hms(7, 8, 23.5), dms(-26, 23, 36), 1.84, 'y'],
  ['aludra', null, hms(7, 24, 5.7), dms(-29, 18, 11), 2.45, 'b'],
  ['procyon', '프로키온', hms(7, 39, 18.1), dms(5, 13, 30), 0.34, 'w'],
  ['gomeisa', null, hms(7, 27, 9.0), dms(8, 17, 22), 2.89, 'b'],
  // 쌍둥이
  ['castor', '카스토르', hms(7, 34, 36.0), dms(31, 53, 18), 1.58, 'w'],
  ['pollux', '폴룩스', hms(7, 45, 18.9), dms(28, 1, 34), 1.14, 'o'],
  ['alhena', null, hms(6, 37, 42.7), dms(16, 23, 57), 1.93, 'w'],
  ['mebsuta', null, hms(6, 43, 55.9), dms(25, 7, 52), 3.06, 'y'],
  ['wasat', null, hms(7, 20, 7.4), dms(21, 58, 56), 3.53, 'w'],
  ['tejat', null, hms(6, 22, 57.6), dms(22, 30, 49), 2.87, 'r'],
  // 황소
  ['aldebaran', '알데바란', hms(4, 35, 55.2), dms(16, 30, 33), 0.85, 'o'],
  ['elnath', null, hms(5, 26, 17.5), dms(28, 36, 27), 1.65, 'b'],
  ['zetaTau', null, hms(5, 37, 38.7), dms(21, 8, 33), 3.0, 'b'],
  ['gammaTau', null, hms(4, 19, 47.6), dms(15, 37, 39), 3.65, 'o'],
  ['ainTau', null, hms(4, 28, 37.0), dms(19, 10, 50), 3.53, 'o'],
  // 마차부
  ['capella', '카펠라', hms(5, 16, 41.4), dms(45, 59, 53), 0.08, 'y'],
  ['menkalinan', null, hms(5, 59, 31.7), dms(44, 56, 51), 1.9, 'w'],
  ['thetaAur', null, hms(5, 59, 43.3), dms(37, 12, 45), 2.62, 'w'],
  ['iotaAur', null, hms(4, 56, 59.6), dms(33, 9, 58), 2.69, 'o'],
  // 사자
  ['regulus', '레굴루스', hms(10, 8, 22.3), dms(11, 58, 2), 1.35, 'b'],
  ['denebola', '데네볼라', hms(11, 49, 3.6), dms(14, 34, 19), 2.13, 'w'],
  ['algieba', null, hms(10, 19, 58.4), dms(19, 50, 29), 2.08, 'o'],
  ['zosma', null, hms(11, 14, 6.5), dms(20, 31, 25), 2.56, 'w'],
  ['chertan', null, hms(11, 14, 14.4), dms(15, 25, 46), 3.33, 'w'],
  ['etaLeo', null, hms(10, 7, 19.9), dms(16, 45, 45), 3.48, 'w'],
  ['adhafera', null, hms(10, 16, 41.4), dms(23, 25, 2), 3.43, 'w'],
  ['rasalas', null, hms(9, 52, 45.8), dms(26, 0, 25), 3.88, 'o'],
  ['epsLeo', null, hms(9, 45, 51.1), dms(23, 46, 27), 2.98, 'y'],
  // 목동 · 처녀 · 북쪽왕관
  ['arcturus', '아르크투루스', hms(14, 15, 39.7), dms(19, 10, 57), -0.05, 'o'],
  ['izar', null, hms(14, 44, 59.2), dms(27, 4, 27), 2.37, 'o'],
  ['muphrid', null, hms(13, 54, 41.1), dms(18, 23, 52), 2.68, 'y'],
  ['seginus', null, hms(14, 32, 4.7), dms(38, 18, 30), 3.03, 'w'],
  ['nekkar', null, hms(15, 1, 56.8), dms(40, 23, 26), 3.49, 'y'],
  ['deltaBoo', null, hms(15, 15, 30.2), dms(33, 18, 53), 3.47, 'y'],
  ['rhoBoo', null, hms(14, 31, 49.8), dms(30, 22, 17), 3.58, 'o'],
  ['spica', '스피카', hms(13, 25, 11.6), dms(-11, 9, 41), 0.97, 'b'],
  ['alphecca', null, hms(15, 34, 41.3), dms(26, 42, 53), 2.23, 'w'],
  // 전갈
  ['antares', '안타레스', hms(16, 29, 24.5), dms(-26, 25, 55), 1.06, 'r'],
  ['acrab', null, hms(16, 5, 26.2), dms(-19, 48, 20), 2.62, 'b'],
  ['dschubba', null, hms(16, 0, 20.0), dms(-22, 37, 18), 2.29, 'b'],
  ['piSco', null, hms(15, 58, 51.1), dms(-26, 6, 51), 2.89, 'b'],
  ['sigmaSco', null, hms(16, 21, 11.3), dms(-25, 35, 34), 2.89, 'b'],
  ['tauSco', null, hms(16, 35, 53.0), dms(-28, 12, 58), 2.82, 'b'],
  ['epsSco', null, hms(16, 50, 9.8), dms(-34, 17, 36), 2.29, 'o'],
  ['mu1Sco', null, hms(16, 51, 52.2), dms(-38, 2, 51), 3.0, 'b'],
  ['zeta2Sco', null, hms(16, 54, 35.0), dms(-42, 21, 41), 3.62, 'o'],
  ['etaSco', null, hms(17, 12, 9.2), dms(-43, 14, 21), 3.33, 'w'],
  ['sargas', null, hms(17, 37, 19.1), dms(-42, 59, 52), 1.86, 'y'],
  ['iota1Sco', null, hms(17, 47, 35.1), dms(-40, 7, 37), 2.99, 'y'],
  ['kappaSco', null, hms(17, 42, 29.3), dms(-39, 1, 48), 2.39, 'b'],
  ['shaula', '샤울라', hms(17, 33, 36.5), dms(-37, 6, 14), 1.62, 'b'],
  ['lesath', null, hms(17, 30, 45.8), dms(-37, 17, 45), 2.7, 'b'],
  // 궁수 (남두육성 주전자)
  ['kausAustralis', null, hms(18, 24, 10.3), dms(-34, 23, 5), 1.85, 'b'],
  ['kausMedia', null, hms(18, 20, 59.6), dms(-29, 49, 41), 2.7, 'o'],
  ['kausBorealis', null, hms(18, 27, 58.2), dms(-25, 25, 18), 2.81, 'o'],
  ['alnasl', null, hms(18, 5, 48.5), dms(-30, 25, 27), 2.99, 'o'],
  ['nunki', '눈키', hms(18, 55, 15.9), dms(-26, 17, 48), 2.05, 'b'],
  ['ascella', null, hms(19, 2, 36.7), dms(-29, 52, 49), 2.6, 'w'],
  ['phiSgr', null, hms(18, 45, 39.4), dms(-26, 59, 27), 3.17, 'b'],
  ['tauSgr', null, hms(19, 6, 56.4), dms(-27, 40, 13), 3.32, 'o'],
  // 백조 · 거문고 · 독수리
  ['deneb', '데네브', hms(20, 41, 25.9), dms(45, 16, 49), 1.25, 'w'],
  ['sadr', null, hms(20, 22, 13.7), dms(40, 15, 24), 2.23, 'y'],
  ['albireo', '알비레오', hms(19, 30, 43.3), dms(27, 57, 35), 3.05, 'o'],
  ['gienahCyg', null, hms(20, 46, 12.7), dms(33, 58, 13), 2.48, 'o'],
  ['deltaCyg', null, hms(19, 44, 58.5), dms(45, 7, 51), 2.87, 'b'],
  ['vega', '직녀성(베가)', hms(18, 36, 56.3), dms(38, 47, 1), 0.03, 'w'],
  ['sheliak', null, hms(18, 50, 4.8), dms(33, 21, 46), 3.52, 'w'],
  ['sulafat', null, hms(18, 58, 56.6), dms(32, 41, 22), 3.25, 'b'],
  ['zeta1Lyr', null, hms(18, 44, 46.4), dms(37, 36, 18), 4.36, 'w'],
  ['delta2Lyr', null, hms(18, 54, 30.3), dms(36, 53, 55), 4.3, 'r'],
  ['altair', '견우성(알타이르)', hms(19, 50, 47.0), dms(8, 52, 6), 0.76, 'w'],
  ['tarazed', null, hms(19, 46, 15.6), dms(10, 36, 48), 2.72, 'o'],
  ['alshain', null, hms(19, 55, 18.8), dms(6, 24, 24), 3.71, 'y'],
  ['deltaAql', null, hms(19, 25, 29.9), dms(3, 6, 53), 3.36, 'w'],
  ['zetaAql', null, hms(19, 5, 24.6), dms(13, 51, 48), 2.99, 'w'],
  ['lambdaAql', null, hms(19, 6, 14.9), dms(-4, 52, 57), 3.43, 'b'],
  ['thetaAql', null, hms(20, 11, 18.3), dms(-0, 49, 17), 3.23, 'b'],
  // 페가수스 · 안드로메다 · 페르세우스
  ['markab', null, hms(23, 4, 45.7), dms(15, 12, 19), 2.48, 'w'],
  ['scheat', null, hms(23, 3, 46.5), dms(28, 4, 58), 2.42, 'r'],
  ['algenib', null, hms(0, 13, 14.2), dms(15, 11, 1), 2.83, 'b'],
  ['alpheratz', '알페라츠', hms(0, 8, 23.3), dms(29, 5, 26), 2.06, 'b'],
  ['enif', null, hms(21, 44, 11.2), dms(9, 52, 30), 2.39, 'o'],
  ['homam', null, hms(22, 41, 27.7), dms(10, 49, 53), 3.4, 'b'],
  ['biham', null, hms(22, 10, 12.0), dms(6, 11, 52), 3.53, 'w'],
  ['deltaAnd', null, hms(0, 39, 19.7), dms(30, 51, 40), 3.27, 'o'],
  ['mirach', null, hms(1, 9, 43.9), dms(35, 37, 14), 2.05, 'r'],
  ['almach', null, hms(2, 3, 54.0), dms(42, 19, 47), 2.1, 'o'],
  ['mirfak', '미르파크', hms(3, 24, 19.4), dms(49, 51, 40), 1.79, 'y'],
  ['algol', '알골', hms(3, 8, 10.1), dms(40, 57, 20), 2.12, 'b'],
  ['gammaPer', null, hms(3, 4, 47.8), dms(53, 30, 23), 2.91, 'y'],
  ['deltaPer', null, hms(3, 42, 55.5), dms(47, 47, 15), 3.01, 'b'],
  ['epsPer', null, hms(3, 57, 51.2), dms(40, 0, 37), 2.89, 'b'],
  ['zetaPer', null, hms(3, 54, 7.9), dms(31, 53, 1), 2.85, 'b'],
  // 그 밖의 밝은 별
  ['fomalhaut', '포말하우트', hms(22, 57, 39.0), dms(-29, 37, 20), 1.16, 'w'],
  ['canopus', '카노푸스(남극노인성)', hms(6, 23, 57.1), dms(-52, 41, 44), -0.74, 'w'],
  ['achernar', '아케르나르', hms(1, 37, 42.8), dms(-57, 14, 12), 0.46, 'b'],
  ['rigilKent', '리길 켄타우루스', hms(14, 39, 36.5), dms(-60, 50, 2), -0.27, 'y'],
  ['hadar', '하다르', hms(14, 3, 49.4), dms(-60, 22, 23), 0.61, 'b'],
  ['acrux', '아크룩스', hms(12, 26, 35.9), dms(-63, 5, 57), 0.77, 'b'],
  ['mimosa', '미모사', hms(12, 47, 43.3), dms(-59, 41, 19), 1.25, 'b'],
  ['gacrux', null, hms(12, 31, 10.0), dms(-57, 6, 48), 1.63, 'r'],
  ['deltaCru', null, hms(12, 15, 8.7), dms(-58, 44, 56), 2.79, 'b'],
  ['rasalhague', null, hms(17, 34, 56.1), dms(12, 33, 36), 2.08, 'w'],
  ['eltanin', null, hms(17, 56, 36.4), dms(51, 29, 20), 2.24, 'o'],
  ['alderamin', null, hms(21, 18, 34.8), dms(62, 35, 8), 2.45, 'w'],
  ['alphard', null, hms(9, 27, 35.2), dms(-8, 39, 31), 1.98, 'o'],
  ['diphda', null, hms(0, 43, 35.4), dms(-17, 59, 12), 2.04, 'o'],
  ['menkar', null, hms(3, 2, 16.8), dms(4, 5, 23), 2.54, 'r'],
  ['hamal', null, hms(2, 7, 10.4), dms(23, 27, 45), 2.01, 'o'],
  ['zubeneschamali', null, hms(15, 17, 0.4), dms(-9, 22, 59), 2.61, 'b'],
  ['zubenelgenubi', null, hms(14, 50, 52.7), dms(-16, 2, 30), 2.75, 'w'],
  ['gienahCrv', null, hms(12, 15, 48.4), dms(-17, 32, 31), 2.59, 'b'],
  ['alnair', null, hms(22, 8, 14.0), dms(-46, 57, 40), 1.74, 'b'],
  ['gammaVel', null, hms(8, 9, 32.0), dms(-47, 20, 12), 1.83, 'b'],
  ['naos', null, hms(8, 3, 35.0), dms(-40, 0, 11), 2.21, 'b'],
];

export const STARS = RAW_STARS.map(([id, name, ra, dec, mag, color]) => ({ id, name, ra, dec, mag, color }));
export const STAR_BY_ID = Object.fromEntries(STARS.map((s) => [s.id, s]));

// 별자리 선 (별 키 체인). label: 지도에 표시할 이름
export const CONSTELLATIONS = [
  { label: '북두칠성', chains: [['dubhe', 'merak', 'phecda', 'megrez', 'dubhe'], ['megrez', 'alioth', 'mizar', 'alkaid']] },
  { label: '작은곰', chains: [['polaris', 'yildun', 'epsUMi', 'zetaUMi', 'kochab', 'pherkad', 'etaUMi', 'zetaUMi']] },
  { label: '카시오페이아', chains: [['caph', 'schedar', 'gammaCas', 'ruchbah', 'segin']] },
  {
    label: '오리온',
    chains: [
      ['meissa', 'betelgeuse', 'alnitak', 'saiph'],
      ['meissa', 'bellatrix', 'mintaka', 'rigel'],
      ['mintaka', 'alnilam', 'alnitak'],
    ],
  },
  { label: '큰개', chains: [['mirzam', 'sirius', 'wezen', 'adhara'], ['wezen', 'aludra']] },
  { label: '작은개', chains: [['procyon', 'gomeisa']] },
  { label: '쌍둥이', chains: [['castor', 'mebsuta', 'tejat'], ['pollux', 'wasat', 'alhena'], ['castor', 'pollux']] },
  { label: '황소', chains: [['zetaTau', 'aldebaran', 'gammaTau', 'ainTau', 'elnath']] },
  { label: '마차부', chains: [['capella', 'menkalinan', 'thetaAur', 'elnath', 'iotaAur', 'capella']] },
  {
    label: '사자',
    chains: [
      ['regulus', 'etaLeo', 'algieba', 'adhafera', 'rasalas', 'epsLeo'],
      ['algieba', 'zosma', 'denebola', 'chertan', 'regulus'],
      ['zosma', 'chertan'],
    ],
  },
  { label: '목동', chains: [['muphrid', 'arcturus', 'izar', 'deltaBoo', 'nekkar', 'seginus', 'rhoBoo', 'arcturus']] },
  {
    label: '전갈',
    chains: [
      ['acrab', 'dschubba', 'piSco'],
      ['dschubba', 'sigmaSco', 'antares', 'tauSco', 'epsSco', 'mu1Sco', 'zeta2Sco', 'etaSco', 'sargas', 'iota1Sco', 'kappaSco', 'shaula', 'lesath'],
    ],
  },
  {
    label: '궁수',
    chains: [
      ['alnasl', 'kausMedia', 'kausAustralis', 'alnasl'],
      ['kausMedia', 'kausBorealis', 'phiSgr', 'kausMedia'],
      ['phiSgr', 'nunki', 'tauSgr', 'ascella', 'phiSgr'],
      ['ascella', 'kausAustralis'],
    ],
  },
  { label: '백조', chains: [['deneb', 'sadr', 'albireo'], ['deltaCyg', 'sadr', 'gienahCyg']] },
  { label: '거문고', chains: [['vega', 'zeta1Lyr', 'sheliak', 'sulafat', 'delta2Lyr', 'zeta1Lyr']] },
  { label: '독수리', chains: [['tarazed', 'altair', 'alshain', 'thetaAql'], ['altair', 'deltaAql', 'lambdaAql'], ['deltaAql', 'zetaAql']] },
  { label: '페가수스', chains: [['markab', 'scheat', 'alpheratz', 'algenib', 'markab', 'homam', 'biham', 'enif']] },
  { label: '안드로메다', chains: [['alpheratz', 'deltaAnd', 'mirach', 'almach']] },
  { label: '페르세우스', chains: [['gammaPer', 'mirfak', 'deltaPer', 'epsPer', 'zetaPer'], ['mirfak', 'algol']] },
  { label: '남십자', chains: [['acrux', 'gacrux'], ['mimosa', 'deltaCru']] },
];

// 점선으로 그리는 계절 삼각형
export const ASTERISMS = [
  { label: '여름의 대삼각형', chain: ['vega', 'deneb', 'altair', 'vega'] },
  { label: '겨울의 대삼각형', chain: ['betelgeuse', 'sirius', 'procyon', 'betelgeuse'] },
];

export const DEEP_SKY = [
  { id: 'm31', name: '안드로메다 은하', ra: hms(0, 42, 44.3), dec: dms(41, 16, 9), mag: 3.4 },
  { id: 'm45', name: '플레이아데스(좀생이별)', ra: hms(3, 47, 24), dec: dms(24, 7, 0), mag: 1.6 },
  { id: 'm42', name: '오리온 대성운', ra: hms(5, 35, 17.3), dec: dms(-5, 23, 28), mag: 4.0 },
];

// 은하 중심 (Sgr A*)
export const GALACTIC_CENTER = { ra: hms(17, 45, 40.04), dec: dms(-29, 0, 28.2) };

// 은하수에서 사진으로 담기 좋은 영역 (은하 좌표 l, b). weight: 사진에서 밝기/매력도
export const MILKY_WAY_REGIONS = [
  { id: 'core', name: '은하수 중심부 (궁수·전갈자리)', short: '은하수 중심', l: 0, b: -1, weight: 1.0 },
  { id: 'scutum', name: '방패자리 별구름', short: '방패자리', l: 27, b: -1, weight: 0.75 },
  { id: 'cygnus', name: '백조자리 은하수 (여름의 대삼각형)', short: '백조자리', l: 78, b: 1, weight: 0.6 },
  { id: 'cassiopeia', name: '카시오페이아·페르세우스 은하수', short: '카시오페이아', l: 125, b: 0, weight: 0.35 },
  { id: 'winter', name: '겨울 은하수 (마차부·쌍둥이·오리온)', short: '겨울 은하수', l: 185, b: 0, weight: 0.3 },
  { id: 'carina', name: '용골자리 은하수 (남반구)', short: '용골자리', l: 287, b: -1, weight: 0.9 },
];

// 주요 유성우 (IMO 기준). peakSolarLon: 극대 태양황경(°), ra(h)/dec(°): 복사점
export const METEOR_SHOWERS = [
  { id: 'QUA', name: '사분의자리 유성우', peakSolarLon: 283.15, ra: hms(15, 20, 0), dec: 49, zhr: 110, speed: 41, activeFrom: [12, 28], activeTo: [1, 12] },
  { id: 'LYR', name: '거문고자리 유성우', peakSolarLon: 32.32, ra: hms(18, 4, 0), dec: 34, zhr: 18, speed: 49, activeFrom: [4, 14], activeTo: [4, 30] },
  { id: 'ETA', name: '물병자리 에타 유성우', peakSolarLon: 45.5, ra: hms(22, 32, 0), dec: -1, zhr: 50, speed: 66, activeFrom: [4, 19], activeTo: [5, 28] },
  { id: 'SDA', name: '남쪽 물병자리 델타 유성우', peakSolarLon: 125, ra: hms(22, 40, 0), dec: -16, zhr: 25, speed: 41, activeFrom: [7, 12], activeTo: [8, 23] },
  { id: 'PER', name: '페르세우스자리 유성우', peakSolarLon: 140.0, ra: hms(3, 12, 0), dec: 58, zhr: 100, speed: 59, activeFrom: [7, 17], activeTo: [8, 24] },
  { id: 'DRA', name: '용자리 유성우', peakSolarLon: 195.4, ra: hms(17, 28, 0), dec: 54, zhr: 10, speed: 20, activeFrom: [10, 6], activeTo: [10, 10] },
  { id: 'ORI', name: '오리온자리 유성우', peakSolarLon: 208, ra: hms(6, 20, 0), dec: 16, zhr: 20, speed: 66, activeFrom: [10, 2], activeTo: [11, 7] },
  { id: 'LEO', name: '사자자리 유성우', peakSolarLon: 235.27, ra: hms(10, 12, 0), dec: 22, zhr: 15, speed: 71, activeFrom: [11, 6], activeTo: [11, 30] },
  { id: 'GEM', name: '쌍둥이자리 유성우', peakSolarLon: 262.2, ra: hms(7, 28, 0), dec: 32, zhr: 150, speed: 35, activeFrom: [12, 4], activeTo: [12, 20] },
  { id: 'URS', name: '작은곰자리 유성우', peakSolarLon: 270.7, ra: hms(14, 28, 0), dec: 75, zhr: 10, speed: 33, activeFrom: [12, 17], activeTo: [12, 26] },
];

export const PLANETS = [
  { body: 'Mercury', name: '수성', color: '#c9b9a6' },
  { body: 'Venus', name: '금성', color: '#fff3c4' },
  { body: 'Mars', name: '화성', color: '#ff8a5c' },
  { body: 'Jupiter', name: '목성', color: '#f3d9a8' },
  { body: 'Saturn', name: '토성', color: '#e8d08a' },
];

// IAU 88개 별자리 한글 이름 (Astronomy.Constellation 의 name 기준)
export const CONSTELLATION_KO = {
  Andromeda: '안드로메다', Antlia: '공기펌프', Apus: '극락조', Aquarius: '물병', Aquila: '독수리', Ara: '제단',
  Aries: '양', Auriga: '마차부', Bootes: '목동', Caelum: '조각칼', Camelopardalis: '기린', Cancer: '게',
  'Canes Venatici': '사냥개', 'Canis Major': '큰개', 'Canis Minor': '작은개', Capricornus: '염소', Carina: '용골',
  Cassiopeia: '카시오페이아', Centaurus: '센타우루스', Cepheus: '세페우스', Cetus: '고래', Chamaeleon: '카멜레온',
  Circinus: '컴퍼스', Columba: '비둘기', 'Coma Berenices': '머리털', 'Corona Australis': '남쪽왕관',
  'Corona Borealis': '북쪽왕관', Corvus: '까마귀', Crater: '컵', Crux: '남십자', Cygnus: '백조', Delphinus: '돌고래',
  Dorado: '황새치', Draco: '용', Equuleus: '조랑말', Eridanus: '에리다누스', Fornax: '화로', Gemini: '쌍둥이',
  Grus: '두루미', Hercules: '헤르쿨레스', Horologium: '시계', Hydra: '바다뱀', Hydrus: '물뱀', Indus: '인디언',
  Lacerta: '도마뱀', Leo: '사자', 'Leo Minor': '작은사자', Lepus: '토끼', Libra: '천칭', Lupus: '이리', Lynx: '살쾡이',
  Lyra: '거문고', Mensa: '테이블산', Microscopium: '현미경', Monoceros: '외뿔소', Musca: '파리', Norma: '직각자',
  Octans: '팔분의', Ophiuchus: '뱀주인', Orion: '오리온', Pavo: '공작', Pegasus: '페가수스', Perseus: '페르세우스',
  Phoenix: '봉황', Pictor: '화가', Pisces: '물고기', 'Piscis Austrinus': '남쪽물고기', Puppis: '고물', Pyxis: '나침반',
  Reticulum: '그물', Sagitta: '화살', Sagittarius: '궁수', Scorpius: '전갈', Sculptor: '조각가', Scutum: '방패',
  Serpens: '뱀', Sextans: '육분의', Taurus: '황소', Telescopium: '망원경', Triangulum: '삼각형',
  'Triangulum Australe': '남쪽삼각형', Tucana: '큰부리새', 'Ursa Major': '큰곰', 'Ursa Minor': '작은곰', Vela: '돛',
  Virgo: '처녀', Volans: '날치', Vulpecula: '작은여우',
};
