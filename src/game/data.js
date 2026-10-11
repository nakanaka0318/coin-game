// Run content: nights, omens, charms (お守り), talismans (お札), slot tables,
// and the moon shrine (月の社) upgrades that persist between runs.
import { BOX, STAGE, BELL } from '../sim/config.js';

export const BASE_STATS = {
  dropsPerNight: 30,
  fireInterval: 0.45, // seconds between shots while holding
  turnSpeed: 3, // how fast the pitchers swing to the aim point (units/s)
  boxWidth: BOX.baseWidth,
  boxSpeed: BOX.baseSpeed,
  goldChance: 0,
  goldValue: 3,
  obanChance: 0,
  obanValue: 20,
  cashback: 0, // chance a medal that misses the box refunds one
  twinChance: 0,
  stroke: 1,
  speed: 1,
  checkerHalfGap: STAGE.checkerHalfGap,
  pinBounce: 0.4,
  sideGuards: false,
  sideRefund: 0,
  stockMax: 4,
  slotLuck: 1,
  jpLuck: 1,
  moonLuck: 1,
  jpMult: 1,
  dangoMult: 1,
  starRain: 0,
  feverSpins: 5,
  interestPer: 0, // +1 medal per this many banked at dawn (0 = off)
  interestCap: 0,
  nightBonus: 0,
  overQuotaBonus: 0, // +1 per this many medals over quota (0 = off)
  magnet: 0,
  ballValue: 10,
  malletEvery: 0,
  refillEvery: 0,
  winRain: 0,
  quakePower: 1,
  talismanSlots: 2,
  maxCharms: 5,
  shopCharms: 3,
  rerollBase: 2,
  freeRerolls: 0,
  bellRadius: BELL.radius,
  bellSpeed: 1,
  quotaMult: 1, // eclipse levels raise the quotas
  shopPrice: 1,
  bossHp: 1,
};

// Once the night's medals are gone, up to EXTRA_DROPS more can be shot
// from the bank, one medal each.
export const EXTRA_DROPS = 10;

// Eight nights from new moon to full moon. `phase` drives the moon icon
// (0 = new, 1 = full). Quotas are the night's balance to reach.
export const NIGHTS = [
  { name: '新月', reading: 'しんげつ', phase: 0.0, quota: 10 },
  { name: '三日月', reading: 'みかづき', phase: 0.15, quota: 12 },
  { name: '七日月', reading: 'なのかづき', phase: 0.32, quota: 22 },
  { name: '上弦の月', reading: 'じょうげんのつき', phase: 0.5, quota: 30, boss: 'oni' },
  { name: '十日夜', reading: 'とおかんや', phase: 0.62, quota: 44 },
  { name: '十三夜', reading: 'じゅうさんや', phase: 0.78, quota: 56 },
  { name: '小望月', reading: 'こもちづき', phase: 0.9, quota: 74 },
  { name: '満月', reading: 'まんげつ', phase: 1.0, quota: 100, boss: 'fullmoon' },
];

// Boss nights. Each brings an enemy (ENEMIES) that hovers over the landing
// strip; medals lobbed into it chip away its health.
export const BOSSES = {
  oni: {
    name: '鬼の刻',
    desc: '赤鬼が現れる夜。側壁も短くなり、横からこぼれやすい。',
    enemy: 'oni',
    apply: (s) => { s.shortWalls = true; },
  },
  tanuki: {
    name: '化かしの夜',
    desc: '化け狸が現れる夜。',
    enemy: 'tanuki',
    apply: () => {},
  },
  fullmoon: {
    name: '満月の宴',
    desc: '大天狗が現れる最後の夜。ジャックポット確率2倍。',
    enemy: 'tengu',
    apply: (s) => { s.jpLuck *= 2; },
  },
};

// Damage a medal deals to a boss, by kind (silver, gold, ball, oban).
export const BOSS_DAMAGE = [1, 3, 6, 8];

export const ENEMIES = {
  oni: {
    name: '赤鬼', hp: 24, speed: 1.6, wait: [0.8, 1.8], shards: 4,
    curse: 'お賽銭箱に入ったメダルを3枚に1枚横取りする。',
    reward: 'メダル10枚と、横取りした分の倍を返す。金メダル2枚も落とす。',
  },
  tanuki: {
    name: '化け狸', hp: 30, speed: 2.8, wait: [0.3, 0.9], shards: 5,
    curse: 'お賽銭箱を化かして動きを鈍らせる (×0.55)。',
    reward: 'メダル15枚の雨と金メダル3枚。',
  },
  tengu: {
    name: '大天狗', hp: 50, speed: 4.4, wait: [0.5, 1.3], shards: 8,
    curse: '9秒ごとに天狗風を起こし、台のメダルを横へ吹き飛ばす。',
    reward: 'メダル30枚の雨と金メダル4枚。',
  },
};

// 月蝕 (eclipse) levels: optional hard modes. Each level adds its rule to
// those below it; clearing a level unlocks the next.
export const ECLIPSES = [
  { name: '並', rule: 'ふつうの月夜。' },
  { name: '月蝕 一', rule: 'ノルマ +15%。', apply: (s) => { s.quotaMult *= 1.15; } },
  { name: '月蝕 二', rule: '夜店の値段 +30%、品替え +1枚。', apply: (s) => { s.shopPrice *= 1.3; s.rerollBase += 1; } },
  { name: '月蝕 三', rule: '第6夜に化け狸が現れ、ボスの体力 +50%。', apply: (s) => { s.bossHp *= 1.5; } },
  { name: '月蝕 四', rule: '鳥居の鈴が大きく速くなり、今夜のメダル −3枚。', apply: (s) => { s.bellRadius += 0.08; s.bellSpeed *= 1.3; s.dropsPerNight -= 3; } },
  { name: '月蝕 五', rule: '毎晩、悪い縁起がもうひとつ重なり、ノルマさらに +15%。', apply: (s) => { s.quotaMult *= 1.15; } },
];
export const ECLIPSE_MAX = ECLIPSES.length - 1;
export const ECLIPSE_TANUKI = 3; // from this level, night 6 is a boss night
export const ECLIPSE_CURSE = 5; // from this level, every night adds a bad omen

export function eclipseShardMult(level) {
  return 1 + 0.3 * level;
}

export const OMENS = [
  { id: 'tailwind', name: '追い風', good: true, desc: 'プッシャーが速く動く。', apply: (s) => { s.speed *= 1.25; } },
  { id: 'overcast', name: '曇天', good: false, desc: 'スロットの当たり確率 ×0.7。', apply: (s) => { s.slotLuck *= 0.7; } },
  { id: 'harvest', name: '豊年', good: true, desc: '今夜のメダル +5枚。', apply: (s) => { s.dropsPerNight += 5; } },
  { id: 'golden', name: '金色の夜', good: true, desc: '金メダルが出やすい (+10%)。', apply: (s) => { s.goldChance += 0.1; } },
  { id: 'tremor', name: '地鳴り', good: true, desc: '15秒ごとに盤面が揺れる。', apply: (s) => { s.tremor = 15; } },
  { id: 'foxfire', name: '狐火', good: true, desc: '20秒ごとに金メダルがステージに現れる。', apply: (s) => { s.foxfire = 20; } },
  { id: 'fog', name: '霧', good: false, desc: '鳥居が狭い。', apply: (s) => { s.checkerHalfGap *= 0.8; } },
  { id: 'fullhouse', name: '大入り', good: true, desc: '夜のはじめにメダルの雨 20枚。', apply: (s) => { s.openingRain = 20; } },
  { id: 'drought', name: '日照り', good: false, desc: '今夜のメダル −4枚。', apply: (s) => { s.dropsPerNight -= 4; } },
  { id: 'sleepy', name: '眠り箱', good: false, desc: 'お賽銭箱の動きが鈍い (×0.7)。', apply: (s) => { s.boxSpeed *= 0.7; } },
  { id: 'festival', name: '縁日', good: true, desc: 'お賽銭箱が大きい (×1.25)。', apply: (s) => { s.boxWidth *= 1.25; } },
];

// Charms persist for the whole run. `seal` is the single character stamped
// on the charm's seal icon.
export const CHARMS = [
  { id: 'neko', name: '招き猫', seal: '猫', rarity: 2, price: 8, desc: '手前まで側壁を延ばし、横落ちを防ぐ。', apply: (s) => { s.sideGuards = true; } },
  { id: 'kine', name: '餅つき杵', seal: '杵', rarity: 1, price: 6, desc: '払い出し6枚ごとに銀メダル1枚がプッシャー上に補充される。', apply: (s) => { s.refillEvery = s.refillEvery ? Math.max(3, s.refillEvery - 2) : 6; } },
  { id: 'kane', name: '祝いの鐘', seal: '鐘', rarity: 1, price: 5, desc: 'スロットが当たるたび銀メダル3枚の雨。', apply: (s) => { s.winRain += 3; } },
  { id: 'tamago', name: '金の卵', seal: '卵', rarity: 1, price: 6, desc: '撃つメダルの12%が金メダルになる。', apply: (s) => { s.goldChance += 0.12; } },
  { id: 'mimi', name: '兎の耳', seal: '耳', rarity: 1, price: 5, desc: '鳥居の幅 +35%。抽選に入りやすい。', apply: (s) => { s.checkerHalfGap *= 1.35; } },
  { id: 'dango', name: '団子三兄弟', seal: '団', rarity: 1, price: 4, desc: '団子揃いの払い出しが3倍。', apply: (s) => { s.dangoMult *= 3; } },
  { id: 'jishaku', name: '磁石の鳥居', seal: '磁', rarity: 2, price: 8, desc: '手前の縁にあるメダルを少しずつ引き寄せる。', apply: (s) => { s.magnet += 1; } },
  { id: 'futago', name: '双子月', seal: '双', rarity: 2, price: 8, desc: '撃つたび25%で反対のピッチャーからもう1枚おまけ。', apply: (s) => { s.twinChance += 0.25; } },
  { id: 'tsubo', name: '招福の壺', seal: '壺', rarity: 1, price: 5, desc: '夜明け (上納の後) に持ちメダル8枚ごとに+1 (最大8)。', apply: (s) => { s.interestPer = 8; s.interestCap += 8; } },
  { id: 'sasa', name: '福笹', seal: '笹', rarity: 1, price: 6, desc: '毎晩もらえるメダル +5枚。', apply: (s) => { s.dropsPerNight += 5; } },
  { id: 'shichi', name: '七宝', seal: '七', rarity: 3, price: 9, desc: '7揃い (ジャックポット) の確率2倍。', apply: (s) => { s.jpLuck *= 2; } },
  { id: 'kagami', name: '鏡餅', seal: '鏡', rarity: 2, price: 7, desc: '横に落ちたメダルの35%が戻ってくる。', apply: (s) => { s.sideRefund = 1 - (1 - s.sideRefund) * 0.65; } },
  { id: 'sake', name: '月見酒', seal: '酒', rarity: 2, price: 7, desc: 'ジャックポットの払い出しが2倍。', apply: (s) => { s.jpMult *= 2; } },
  { id: 'kozuchi', name: '打ち出の小槌', seal: '槌', rarity: 3, price: 10, desc: '払い出し12枚ごとに金メダルが1枚ステージに降る。', apply: (s) => { s.malletEvery = s.malletEvery ? Math.max(6, s.malletEvery - 4) : 12; } },
  { id: 'hane', name: '跳ね兎', seal: '跳', rarity: 1, price: 4, desc: '釘がよく弾み、メダルが中央へ寄る。', apply: (s) => { s.pinBounce = 0.85; } },
  { id: 'hoshi', name: '星降り', seal: '星', rarity: 2, price: 6, desc: '星揃いで銀メダル10枚の雨が降る。', apply: (s) => { s.starRain += 10; } },
  { id: 'senryo', name: '千両箱', seal: '千', rarity: 2, price: 7, desc: '夜明けに+6枚、ノルマ超過5枚ごとに+1。', apply: (s) => { s.nightBonus += 6; s.overQuotaBonus = 5; } },
  { id: 'juzu', name: '数珠', seal: '珠', rarity: 1, price: 5, desc: '保留の上限 +4。当たり確率 +15%。', apply: (s) => { s.stockMax += 4; s.slotLuck *= 1.15; } },
  { id: 'hakari', name: '黄金の秤', seal: '秤', rarity: 2, price: 7, desc: '金メダルの価値が3枚から5枚に。', apply: (s) => { s.goldValue = 5; } },
  { id: 'shizuku', name: '月の雫', seal: '雫', rarity: 2, price: 7, desc: '月玉の価値 10→25、満月揃いが出やすい。', apply: (s) => { s.ballValue = 25; s.moonLuck *= 1.6; } },
  { id: 'raijin', name: '雷神の太鼓', seal: '雷', rarity: 1, price: 4, desc: 'お札を3枚まで持てる。地震札の威力2倍。', apply: (s) => { s.talismanSlots += 1; s.quakePower *= 2; } },
  { id: 'hako', name: '大きな賽銭箱', seal: '箱', rarity: 2, price: 8, desc: 'お賽銭箱の幅 ×1.35。', apply: (s) => { s.boxWidth *= 1.35; } },
  { id: 'idaten', name: '韋駄天', seal: '速', rarity: 1, price: 5, desc: 'お賽銭箱の速さ ×1.5。', apply: (s) => { s.boxSpeed *= 1.5; } },
  { id: 'matsuri', name: '祭囃子', seal: '囃', rarity: 2, price: 7, desc: 'フィーバーの回転数 +3。', apply: (s) => { s.feverSpins += 3; } },
];

export const TALISMANS = [
  { id: 'quake', name: '地震札', seal: '震', price: 3, desc: '盤面を大きく揺らす。' },
  { id: 'gust', name: '突風札', seal: '風', price: 4, desc: '手前の縁のメダルを前へ吹き飛ばす。' },
  { id: 'gold', name: '金貨札', seal: '金', price: 4, desc: '金メダル3枚をプッシャー上に落とす。' },
  { id: 'ball', name: '月玉札', seal: '玉', price: 5, desc: '月玉を1つ落とす。お賽銭箱に入れば大当たり。' },
  { id: 'rain', name: '雨乞札', seal: '雨', price: 5, desc: 'メダル15枚の雨を降らせる。' },
  { id: 'double', name: '倍札', seal: '倍', price: 5, desc: '20秒間、払い出しが2倍。' },
  { id: 'spin', name: '回札', seal: '回', price: 3, desc: 'スロットの保留を3つ追加。' },
  { id: 'fever', name: '祭札', seal: '祭', price: 7, desc: 'その場でフィーバー突入。' },
];

// Slot symbols, in reel order.
export const SYMBOLS = [
  { id: 'seven', label: '7' },
  { id: 'moon', label: '月' },
  { id: 'rabbit', label: '兎' },
  { id: 'dango', label: '団子' },
  { id: 'sakura', label: '桜' },
  { id: 'star', label: '星' },
];

// Probability of each three-of-a-kind per spin, normally and in fever.
export const SLOT_TABLE = {
  seven: 1 / 150,
  moon: 1 / 55,
  rabbit: 1 / 18,
  dango: 1 / 8,
  sakura: 1 / 9,
  star: 1 / 12,
};
export const FEVER_TABLE = {
  seven: 1 / 45,
  moon: 1 / 22,
  rabbit: 1 / 5,
  dango: 1 / 4,
  sakura: 1 / 9,
  star: 1 / 6,
};

// How exciting each outcome is (drives hold lamp colours and presentation).
export const OUTCOME_TIER = { seven: 4, moon: 3, rabbit: 2, dango: 1, sakura: 1, star: 1 };

// Hold lamp colour weights by tier: white, blue, green, red, gold, rainbow.
export const LAMP_COLORS = ['white', 'blue', 'green', 'red', 'gold', 'rainbow'];
export const LAMP_WEIGHTS = [
  [80, 16, 4, 0, 0, 0],
  [45, 35, 17, 3, 0, 0],
  [15, 30, 35, 20, 0, 0],
  [0, 10, 30, 50, 10, 0],
  [0, 0, 10, 45, 35, 10],
];

// Presentation weights by tier: reach, super, revival, premium (all-spin).
// Tier 0 (miss) uses: plain, reach, super.
export const PRESENTATION_WEIGHTS = [
  { plain: 70, reach: 24, super: 6 },
  { reach: 75, super: 20, revival: 5 },
  { reach: 35, super: 45, revival: 20 },
  { super: 50, revival: 20, premium: 30 },
  { super: 40, revival: 25, premium: 35 },
];

export const RARITY_WEIGHT = { 1: 6, 2: 3, 3: 1 };
export const RARITY_NAME = { 1: '並', 2: '上', 3: '特上' };

// --- Moon shrine (meta progression) ----------------------------------------

// Price for a shrine upgrade: `rank` 1 (cheap) to 10 (dear), growing with
// each level already bought.
export function shrinePrice(rank, level) {
  const base = Math.round(5 * Math.pow(1.3, rank - 1));
  return Math.round(base * Math.pow(1.3, level));
}

// Moon shards earned for a run that cleared `cleared` nights.
export function shardsFor(cleared, wonRun) {
  let n = 2;
  for (let k = 1; k <= cleared; k++) n += 3 + 2 * k;
  if (wonRun) n += 40;
  return n;
}

export const SHRINE = [
  { id: 'fireRate', name: 'ピッチャーの連射', seal: '連', rank: 5, max: 8, desc: '長押しの連射が速くなる。', effect: (lv) => `間隔 ${(0.45 - 0.035 * lv).toFixed(2)}秒`, apply: (s, lv) => { s.fireInterval = 0.45 - 0.035 * lv; } },
  { id: 'turn', name: 'ピッチャーの振り向き', seal: '向', rank: 1, max: 6, desc: '狙いを変えたときにピッチャーが素早く向き直る。', effect: (lv) => `${(3 + 1.6 * lv).toFixed(1)} / 秒`, apply: (s, lv) => { s.turnSpeed = 3 + 1.6 * lv; } },
  { id: 'boxSpeed', name: 'お賽銭箱の速さ', seal: '駆', rank: 3, max: 8, desc: '落ちてくるメダルへ箱が速く動く。', effect: (lv) => `×${(1 + 0.3 * lv).toFixed(1)}`, apply: (s, lv) => { s.boxSpeed *= 1 + 0.3 * lv; } },
  { id: 'boxSize', name: 'お賽銭箱の大きさ', seal: '広', rank: 7, max: 8, desc: '箱の幅が広がる。', effect: (lv) => `幅 +${(0.38 * lv).toFixed(1)}`, apply: (s, lv) => { s.boxWidth += 0.38 * lv; } },
  { id: 'goldRate', name: '金メダルの出現率', seal: '金', rank: 3, max: 8, desc: 'ちょっと高い金メダル (3枚分) を撃つ確率が上がる。', effect: (lv) => `+${(2.5 * lv).toFixed(1)}%`, apply: (s, lv) => { s.goldChance += 0.025 * lv; } },
  { id: 'oban', name: '大判', seal: '判', rank: 5, max: 1, desc: 'めっちゃ高い大判 (20枚分) を撃つようになる。', effect: () => '出現 3%', apply: (s, lv) => { s.obanChance += 0.03 * lv; } },
  { id: 'reroll', name: '夜店の目利き', seal: '替', rank: 7, max: 1, desc: '品替えが1枚安くなり、毎回1度は無料。', effect: () => '割引 + 無料1回', apply: (s, lv) => { s.rerollBase -= lv; s.freeRerolls += lv; } },
  { id: 'torii', name: '大鳥居', seal: '鳥', rank: 8, max: 1, desc: '鳥居が少し大きくなる。', effect: () => '幅 +20%', apply: (s, lv) => { s.checkerHalfGap += 0.14 * lv; } },
  { id: 'cashback', name: 'お賽銭返し', seal: '返', rank: 6, max: 1, desc: '箱に入らなかったメダルも、30%で1枚戻ってくる。', effect: () => '30%', apply: (s, lv) => { s.cashback = 0.3 * lv; } },
  { id: 'startBank', name: '軍資金', seal: '資', rank: 2, max: 6, desc: 'ラン開始時の持ちメダルが増える。', effect: (lv) => `+${5 * lv}枚`, apply: () => {} },
  { id: 'nightMedals', name: '今夜のメダル増量', seal: '増', rank: 4, max: 5, desc: '毎晩もらえるメダルが増える。', effect: (lv) => `+${2 * lv}枚`, apply: (s, lv) => { s.dropsPerNight += 2 * lv; } },
  { id: 'stock', name: '保留の数珠', seal: '珠', rank: 4, max: 4, desc: 'スロットの保留上限が増える。', effect: (lv) => `+${lv}`, apply: (s, lv) => { s.stockMax += lv; } },
  { id: 'moon', name: '月玉の加護', seal: '玉', rank: 4, max: 4, desc: '満月揃い (月玉とフィーバー) が出やすい。', effect: (lv) => `×${(1 + 0.25 * lv).toFixed(2)}`, apply: (s, lv) => { s.moonLuck *= 1 + 0.25 * lv; } },
  { id: 'fever', name: 'フィーバー延長', seal: '祭', rank: 5, max: 5, desc: 'フィーバーが長く続く。', effect: (lv) => `+${lv}回転`, apply: (s, lv) => { s.feverSpins += lv; } },
  { id: 'starter', name: 'お札の授かり', seal: '授', rank: 3, max: 2, desc: 'ランの始めにお札をもらえる。', effect: (lv) => `${lv}枚`, apply: () => {} },
  { id: 'shopSize', name: '夜店の品揃え', seal: '揃', rank: 6, max: 1, desc: '夜店のお守りが4つ並ぶ。', effect: () => '4品', apply: (s, lv) => { s.shopCharms += lv; } },
  { id: 'charmSlot', name: 'お守り袋', seal: '袋', rank: 9, max: 1, desc: 'お守りを6つまで持てる。', effect: () => '6枠', apply: (s, lv) => { s.maxCharms += lv; } },
];
