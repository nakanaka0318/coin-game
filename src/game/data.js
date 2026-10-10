// Run content: nights, omens, charms (お守り), talismans (お札), slot table.

export const BASE_STATS = {
  dropsPerNight: 30,
  goldChance: 0,
  goldValue: 3,
  twinChance: 0,
  stroke: 1,
  speed: 1,
  checkerHalfGap: 0.66,
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
};

export const MAX_CHARMS = 5;

// Once the night's medals are gone, up to EXTRA_DROPS more can be dropped
// from the bank, one medal each. They count against the night's balance.
export const EXTRA_DROPS = 10;

// Eight nights from new moon to full moon. `phase` drives the moon icon
// (0 = new, 1 = full). Quotas are medals paid out during that night.
export const NIGHTS = [
  { name: '新月', reading: 'しんげつ', phase: 0.0, quota: 18 },
  { name: '三日月', reading: 'みかづき', phase: 0.15, quota: 26 },
  { name: '七日月', reading: 'なのかづき', phase: 0.32, quota: 36 },
  { name: '上弦の月', reading: 'じょうげんのつき', phase: 0.5, quota: 48, boss: 'oni' },
  { name: '十日夜', reading: 'とおかんや', phase: 0.62, quota: 62 },
  { name: '十三夜', reading: 'じゅうさんや', phase: 0.78, quota: 76 },
  { name: '小望月', reading: 'こもちづき', phase: 0.9, quota: 92 },
  { name: '満月', reading: 'まんげつ', phase: 1.0, quota: 112, boss: 'fullmoon' },
];

export const BOSSES = {
  oni: {
    name: '鬼の刻',
    desc: '側壁が短くなり、横へこぼれやすい夜。',
    apply: (s) => { s.shortWalls = true; },
  },
  fullmoon: {
    name: '満月の宴',
    desc: 'ジャックポット確率2倍。最後のノルマを越えろ。',
    apply: (s) => { s.jpLuck *= 2; },
  },
};

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
];

// Charms persist for the whole run. `seal` is the single character stamped
// on the charm's seal icon.
export const CHARMS = [
  { id: 'neko', name: '招き猫', seal: '猫', rarity: 2, price: 8, desc: '手前まで側壁を延ばし、横落ちを防ぐ。', apply: (s) => { s.sideGuards = true; } },
  { id: 'kine', name: '餅つき杵', seal: '杵', rarity: 1, price: 6, desc: '払い出し6枚ごとに銀メダル1枚がプッシャー上に補充される。', apply: (s) => { s.refillEvery = s.refillEvery ? Math.max(3, s.refillEvery - 2) : 6; } },
  { id: 'kane', name: '祝いの鐘', seal: '鐘', rarity: 1, price: 5, desc: 'スロットが当たるたび銀メダル3枚の雨。', apply: (s) => { s.winRain += 3; } },
  { id: 'tamago', name: '金の卵', seal: '卵', rarity: 1, price: 6, desc: '投入メダルの12%が金メダルになる。', apply: (s) => { s.goldChance += 0.12; } },
  { id: 'mimi', name: '兎の耳', seal: '耳', rarity: 1, price: 5, desc: '鳥居の幅 +35%。抽選に入りやすい。', apply: (s) => { s.checkerHalfGap *= 1.35; } },
  { id: 'dango', name: '団子三兄弟', seal: '団', rarity: 1, price: 4, desc: '団子揃いの払い出しが3倍。', apply: (s) => { s.dangoMult *= 3; } },
  { id: 'jishaku', name: '磁石の鳥居', seal: '磁', rarity: 2, price: 8, desc: '手前の縁にあるメダルを少しずつ引き寄せる。', apply: (s) => { s.magnet += 1; } },
  { id: 'futago', name: '双子月', seal: '双', rarity: 2, price: 8, desc: '投入のたび25%でもう1枚おまけ。', apply: (s) => { s.twinChance += 0.25; } },
  { id: 'tsubo', name: '招福の壺', seal: '壺', rarity: 1, price: 5, desc: '夜明け (上納の後) に持ちメダル8枚ごとに+1 (最大8)。', apply: (s) => { s.interestPer = 8; s.interestCap += 8; } },
  { id: 'sasa', name: '福笹', seal: '笹', rarity: 1, price: 6, desc: '毎晩もらえるメダル +5枚。', apply: (s) => { s.dropsPerNight += 5; } },
  { id: 'shichi', name: '七宝', seal: '七', rarity: 3, price: 9, desc: '7揃い (ジャックポット) の確率2倍。', apply: (s) => { s.jpLuck *= 2; } },
  { id: 'kagami', name: '鏡餅', seal: '鏡', rarity: 2, price: 7, desc: '横に落ちたメダルの35%が戻ってくる。', apply: (s) => { s.sideRefund = 1 - (1 - s.sideRefund) * 0.65; } },
  { id: 'sake', name: '月見酒', seal: '酒', rarity: 2, price: 7, desc: 'ジャックポットの払い出しが2倍。', apply: (s) => { s.jpMult *= 2; } },
  { id: 'kozuchi', name: '打ち出の小槌', seal: '槌', rarity: 3, price: 10, desc: '払い出し12枚ごとに金メダルが1枚ステージに降る。', apply: (s) => { s.malletEvery = s.malletEvery ? Math.max(6, s.malletEvery - 4) : 12; } },
  { id: 'hane', name: '跳ね兎', seal: '跳', rarity: 1, price: 4, desc: '釘がよく弾み、メダルが中央へ寄る。', apply: (s) => { s.pinBounce = 0.85; } },
  { id: 'hoshi', name: '星降り', seal: '星', rarity: 2, price: 6, desc: '星揃いで銀メダル10枚の雨が降る。', apply: (s) => { s.starRain += 10; } },
  { id: 'senryo', name: '千両箱', seal: '千', rarity: 2, price: 7, desc: '夜明けに+6枚、ノルマ超過5枚ごとに+1。', apply: (s) => { s.nightBonus += 6; s.overQuotaBonus = 5; } },
  { id: 'juzu', name: '数珠', seal: '珠', rarity: 1, price: 5, desc: '保留の上限が8に。当たり確率 +15%。', apply: (s) => { s.stockMax = 8; s.slotLuck *= 1.15; } },
  { id: 'hakari', name: '黄金の秤', seal: '秤', rarity: 2, price: 7, desc: '金メダルの価値が3枚から5枚に。', apply: (s) => { s.goldValue = 5; } },
  { id: 'shizuku', name: '月の雫', seal: '雫', rarity: 2, price: 7, desc: '月玉の価値 10→25、満月揃いが出やすい。', apply: (s) => { s.ballValue = 25; s.moonLuck *= 1.6; } },
  { id: 'raijin', name: '雷神の太鼓', seal: '雷', rarity: 1, price: 4, desc: 'お札を3枚まで持てる。地震札の威力2倍。', apply: (s) => { s.talismanSlots = 3; s.quakePower *= 2; } },
];

export const TALISMANS = [
  { id: 'quake', name: '地震札', seal: '震', price: 3, desc: '盤面を大きく揺らす。' },
  { id: 'gust', name: '突風札', seal: '風', price: 4, desc: '手前の縁のメダルを前へ吹き飛ばす。' },
  { id: 'gold', name: '金貨札', seal: '金', price: 4, desc: '金メダル3枚をプッシャー上に落とす。' },
  { id: 'ball', name: '月玉札', seal: '玉', price: 5, desc: '月玉を1つ落とす。手前に落とすと大当たり。' },
  { id: 'rain', name: '雨乞札', seal: '雨', price: 5, desc: 'メダル15枚の雨を降らせる。' },
  { id: 'double', name: '倍札', seal: '倍', price: 5, desc: '20秒間、払い出しが2倍。' },
  { id: 'spin', name: '回札', seal: '回', price: 3, desc: 'スロットの保留を3つ追加。' },
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

// Base probability of each three-of-a-kind per spin.
export const SLOT_TABLE = {
  seven: 1 / 160,
  moon: 1 / 45,
  rabbit: 1 / 22,
  dango: 1 / 9,
  sakura: 1 / 8,
  star: 1 / 14,
};

export const RARITY_WEIGHT = { 1: 6, 2: 3, 3: 1 };
export const RARITY_NAME = { 1: '並', 2: '上', 3: '特上' };
