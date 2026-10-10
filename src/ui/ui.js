// DOM layer: HUD, side rails, toasts, payout pops and the modal screens
// (title, night intro, dawn results, shop, game over, clear, help, menu).
import { NIGHTS, MAX_CHARMS, RARITY_NAME, EXTRA_DROPS } from '../game/data.js';
import { charmById, talismanById } from '../game/game.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
};

// Moon icon for a phase in [0 (new), 1 (full)], waxing from the right.
export function moonSvg(phase, size = 40) {
  const r = size / 2 - 2, c = size / 2;
  const rx = Math.abs(1 - 2 * phase) * r;
  const sweep = phase < 0.5 ? 0 : 1;
  const lit = phase <= 0.02
    ? ''
    : phase >= 0.98
      ? `<circle cx="${c}" cy="${c}" r="${r}" fill="url(#mg)"/>`
      : `<path d="M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} A ${rx} ${r} 0 0 ${sweep} ${c} ${c - r} Z" fill="url(#mg)"/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
    <defs><radialGradient id="mg" cx="40%" cy="38%"><stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#e2c372"/></radialGradient></defs>
    <circle cx="${c}" cy="${c}" r="${r}" fill="#22264f" stroke="rgba(240,201,106,.35)" stroke-width="1"/>${lit}</svg>`;
}

export class UI {
  constructor(root, handlers) {
    this.root = root;
    this.on = handlers;
    this.cache = {};
    this._build();
  }

  _build() {
    const r = this.root;
    // HUD
    this.el = {};
    const e = this.el;
    e.moon = h('span');
    e.nightSmall = h('small');
    e.nightName = h('strong');
    e.omen = h('span', { class: 'omen', hidden: true });
    e.quotaB = h('b', { class: 'num' });
    e.quotaOf = h('span', { class: 'num' });
    e.bar = h('i');
    e.quota = h('div', { class: 'quota' },
      h('div', { class: 'quota-top' }, h('small', {}, '今夜の収支'), e.quotaB, e.quotaOf),
      h('div', { class: 'bar' }, e.bar));
    e.bank = h('b', { class: 'num' });
    e.bankStat = h('div', { class: 'stat bank' }, h('small', {}, '持ちメダル'), e.bank);
    e.drops = h('b', { class: 'num' });
    e.dropLabel = h('small', {}, '今夜のメダル');
    e.dropStat = h('div', { class: 'stat' }, e.dropLabel, e.drops);
    e.hud = h('div', { class: 'hud' },
      h('div', { class: 'night-chip' }, e.moon, h('div', { class: 'night-label' }, e.nightSmall, e.nightName, e.omen)),
      e.quota,
      h('div', { class: 'purse' }, e.dropStat, e.bankStat));
    r.append(e.hud);

    e.charms = h('div', { class: 'seals' });
    e.talis = h('div', { class: 'seals' });
    e.railL = h('div', { class: 'rail left' }, h('h3', {}, 'お守り'), e.charms);
    e.railR = h('div', { class: 'rail right' }, h('h3', {}, 'お札'), e.talis);
    r.append(e.railL, e.railR);

    e.hint = h('div', { class: 'hint' }, 'クリック/タップで投入 ・ 長押しで連続 ・ ← → で狙い');
    e.grace = h('div', { class: 'grace', hidden: true });
    e.dawnBtn = h('button', { class: 'btn primary', hidden: true, onclick: () => this.on.dawn() }, '夜明けにする');
    e.borrowBtn = h('button', { class: 'btn gold', hidden: true, onclick: () => this.on.borrow() }, 'メダルを50枚借りる');
    e.dock = h('div', { class: 'dock' }, e.hint, e.grace, e.dawnBtn, e.borrowBtn);
    r.append(e.dock);

    e.viewBtn = h('button', { class: 'btn icon', title: '視点切替 (V)', 'aria-label': '視点切替', onclick: () => this.on.view() }, '視');
    e.menuBtn = h('button', { class: 'btn icon', title: 'メニュー (Esc)', 'aria-label': 'メニュー', onclick: () => this.on.menu() }, '≡');
    e.corner = h('div', { class: 'corner' }, e.viewBtn, e.menuBtn);
    r.append(e.corner);

    e.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    e.pops = h('div');
    r.append(e.toasts, e.pops);
    e.tip = h('div', { class: 'tip', hidden: true });
    r.append(e.tip);

    this.screens = {};
    for (const name of ['title', 'intro', 'dawn', 'shop', 'over', 'clear', 'help', 'menu']) {
      const s = h('div', { class: 'screen', hidden: true });
      this.screens[name] = s;
      r.append(s);
    }
  }

  // --- HUD -----------------------------------------------------------------

  update(game) {
    const e = this.el;
    const c = this.cache;
    const run = game.mode === 'run';
    const n = game.night;
    const set = (key, val, fn) => { if (c[key] !== val) { c[key] = val; fn(val); } };
    set('mode', game.mode + game.phase, () => {
      const playing = game.phase === 'night' || game.phase === 'free';
      e.hud.hidden = !(playing || game.phase === 'dawn' || game.phase === 'shop');
      e.railL.hidden = !run || !(playing || game.phase === 'dawn' || game.phase === 'shop');
      e.railR.hidden = !run || !playing;
      e.dock.hidden = !playing;
      e.corner.hidden = !playing;
      e.quota.style.visibility = run ? 'visible' : 'hidden';
      e.dropStat.hidden = !run;
    });
    if (run && n) {
      set('night', n.index, () => {
        e.moon.innerHTML = moonSvg(n.moonPhase, 40);
        e.nightSmall.textContent = `第${n.index + 1}夜 / ${NIGHTS.length}`;
        e.nightName.textContent = n.name;
      });
      set('omen', (n.omen?.name || '') + (n.boss?.name || ''), () => {
        const o = n.boss || n.omen;
        e.omen.hidden = !o;
        if (o) {
          e.omen.textContent = o.name;
          e.omen.className = `omen ${n.boss ? 'bad' : n.omen.good ? 'good' : 'bad'}`;
          e.omen.title = o.desc;
        }
      });
      const net = game.netOf(n);
      set('paid', `${net}/${n.quota}`, () => {
        e.quotaB.textContent = net;
        e.quotaOf.textContent = `/ ノルマ ${n.quota}`;
        e.bar.style.width = `${Math.max(0, Math.min(100, (net / n.quota) * 100))}%`;
        e.quota.classList.toggle('met', net >= n.quota);
      });
      const extra = n.dropsLeft <= 0;
      set('drops', `${n.dropsLeft}/${n.dropsTotal}/${extra ? game.extraDropsLeft() : ''}`, () => {
        e.dropLabel.textContent = extra ? '追加投入' : '今夜のメダル';
        e.drops.textContent = extra ? `${game.extraDropsLeft()}` : `${n.dropsLeft}`;
        e.dropStat.classList.toggle('low', extra);
      });
    } else if (!run) {
      set('night', 'free', () => {
        e.moon.innerHTML = moonSvg(1, 40);
        e.nightSmall.textContent = 'フリープレイ';
        e.nightName.textContent = '十五夜';
        e.omen.hidden = true;
      });
    }
    set('bank', game.bank, (v) => {
      e.bank.textContent = v;
      e.bankStat.classList.toggle('low', v < 5);
    });
    set('charms', game.charms.join(','), () => this._renderCharms(game));
    set('talis', game.talismans.join(',') + game.stats.talismanSlots + game.phase, () => this._renderTalismans(game));

    // Dock: grace countdown and dawn button
    if (run && n && game.phase === 'night') {
      const out = n.dropsLeft <= 0;
      let graceTxt = '';
      if (out) {
        const left = game.extraDropsLeft();
        const extra = left > 0 ? ` ・ 持ちメダルからあと${left}回追加投入できる` : '';
        graceTxt = n.grace < 7.9 ? `夜明けまで ${Math.ceil(n.grace)}${extra}` : `払い出しを待っています${extra}`;
      }
      set('grace', graceTxt, (v) => { e.grace.hidden = !v; e.grace.textContent = v; e.hint.hidden = !!v; });
      set('dawnBtn', n.cleared, (v) => { e.dawnBtn.hidden = !v; });
    } else {
      set('grace', '', () => { e.grace.hidden = true; e.hint.hidden = false; });
      set('dawnBtn', false, () => { e.dawnBtn.hidden = true; });
    }
    set('borrow', game.mode === 'free' && game.bank <= 0, (v) => { e.borrowBtn.hidden = !v; });
  }

  _seal(charm, extra = {}) {
    const s = h('button', { class: `seal r${charm.rarity}`, 'aria-label': charm.name, ...extra }, charm.seal);
    this._tipFor(s, () => `<b>${charm.name}</b><em>${RARITY_NAME[charm.rarity]} ・ 売値 ${Math.floor(charm.price / 2)}枚</em><br>${charm.desc}`);
    return s;
  }

  _renderCharms(game) {
    const box = this.el.charms;
    box.replaceChildren();
    for (let i = 0; i < MAX_CHARMS; i++) {
      const id = game.charms[i];
      box.append(id ? this._seal(charmById[id]) : h('span', { class: 'seal empty', 'aria-hidden': 'true' }));
    }
  }

  _renderTalismans(game) {
    const box = this.el.talis;
    box.replaceChildren();
    const slots = game.stats.talismanSlots;
    for (let i = 0; i < slots; i++) {
      const id = game.talismans[i];
      if (!id) { box.append(h('span', { class: 'ofuda empty', 'aria-hidden': 'true' })); continue; }
      const t = talismanById[id];
      const b = h('button', { class: 'ofuda', 'aria-label': `${t.name}を使う`, onclick: (ev) => { ev.stopPropagation(); this.on.useTalisman(i); } },
        t.seal, h('kbd', {}, String(i + 1)));
      this._tipFor(b, () => `<b>${t.name}</b><em>クリックで使う ・ キー ${i + 1}</em><br>${t.desc}`);
      box.append(b);
    }
  }

  _tipFor(el, html) {
    const tip = this.el.tip;
    const show = () => {
      tip.innerHTML = html();
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let x = r.right + 10, y = r.top;
      if (x + tw > window.innerWidth - 8) x = r.left - tw - 10;
      if (x < 8) x = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left));
      if (y + th > window.innerHeight - 8) y = window.innerHeight - th - 8;
      if (x === r.left) y = r.top - th - 8;
      tip.style.left = `${x}px`;
      tip.style.top = `${Math.max(8, y)}px`;
    };
    const hide = () => { tip.hidden = true; };
    el.addEventListener('pointerenter', show);
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focus', show);
    el.addEventListener('blur', hide);
  }

  // --- feedback ------------------------------------------------------------

  toast(text, kind = '') {
    const t = h('div', { class: `toast ${kind}` }, text);
    this.el.toasts.append(t);
    while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 2500);
  }

  pop(text, x, y, kind = '') {
    if (this.el.pops.children.length > 24) this.el.pops.firstChild.remove();
    const p = h('div', { class: `pop ${kind}` }, text);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    this.el.pops.append(p);
    setTimeout(() => p.remove(), 1150);
  }

  hideAll() {
    for (const s of Object.values(this.screens)) s.hidden = true;
    this.el.tip.hidden = true;
  }

  anyScreen() {
    return Object.values(this.screens).some((s) => !s.hidden);
  }

  _show(name, card) {
    this.hideAll();
    const s = this.screens[name];
    s.replaceChildren(card);
    s.hidden = false;
    const focus = card.querySelector('.btn.primary, .btn');
    if (focus) setTimeout(() => focus.focus({ preventScroll: true }), 30);
  }

  // --- screens -------------------------------------------------------------

  showTitle({ hasSave, record, settings }) {
    const moonCanvas = h('canvas', { width: 220, height: 220 });
    this.on.drawTitleMoon?.(moonCanvas);
    const toggles = h('div', { class: 'settings-row' }, ...this._settingToggles(settings));
    const card = h('div', { class: 'card title-card' },
      h('div', { class: 'title-moon' }, moonCanvas),
      h('h1', { class: 'logo' }, '月兎プッシャー'),
      h('div', { class: 'logo-sub' }, 'MOON RABBIT PUSHER'),
      h('p', {}, '新月から満月まで、八つの夜を越えるメダルプッシャー。毎晩ノルマ分のメダルを払い出して月へ上納し、残りで夜店のお守りを集めて盤面を育てよう。'),
      h('div', { class: 'actions' },
        hasSave ? h('button', { class: 'btn primary', onclick: () => this.on.continueRun() }, '続きから') : null,
        h('button', { class: hasSave ? 'btn' : 'btn primary', onclick: () => this.on.newRun() }, 'ランをはじめる'),
        h('button', { class: 'btn', onclick: () => this.on.freePlay() }, 'フリープレイ'),
        h('button', { class: 'btn', onclick: () => this.showHelp(() => this.on.backToTitle()) }, '遊び方')),
      record ? h('div', { class: 'record' },
        h('span', {}, '最高到達 ', h('b', {}, record.best ? `第${record.best}夜` : '—')),
        h('span', {}, '満月成就 ', h('b', {}, `${record.clears || 0}回`)),
        h('span', {}, '最大JP ', h('b', {}, `${record.bestJp || 0}枚`))) : null,
      toggles);
    this._show('title', card);
  }

  _settingToggles(settings) {
    const mk = (key, label, values) => {
      const btn = h('button', { class: 'toggle', 'aria-pressed': 'true' });
      const render = () => {
        const v = settings[key];
        const entry = values.find((x) => x[0] === v) || values[0];
        btn.textContent = `${label}: ${entry[1]}`;
        btn.setAttribute('aria-pressed', String(v !== false && v !== 'low'));
      };
      btn.addEventListener('click', () => {
        const i = values.findIndex((x) => x[0] === settings[key]);
        settings[key] = values[(i + 1) % values.length][0];
        render();
        this.on.settings(settings);
      });
      render();
      return btn;
    };
    return [
      mk('sound', '効果音', [[true, 'オン'], [false, 'オフ']]),
      mk('music', '音楽', [[true, 'オン'], [false, 'オフ']]),
      mk('quality', '画質', [['high', '高'], ['medium', '中'], ['low', '低']]),
    ];
  }

  showIntro(night, onGo) {
    const facts = h('div', { class: 'facts' },
      h('div', { class: 'fact' }, h('small', {}, '上納ノルマ'), h('b', { class: 'num' }, `${night.quota}枚`)),
      h('div', { class: 'fact' }, h('small', {}, '今夜のメダル'), h('b', { class: 'num' }, `${night.dropsTotal}枚`)));
    const o = night.boss || night.omen;
    const omen = o ? h('div', { class: `omen-box ${night.boss ? 'boss' : night.omen.good ? 'good' : 'bad'}` }, h('b', {}, night.boss ? `ボス ・ ${o.name}` : o.name), o.desc) : null;
    const moon = h('span', { class: 'moon-big', html: moonSvg(night.moonPhase, 84) });
    const card = h('div', { class: 'card night-intro' },
      moon,
      h('p', { class: 'eyebrow' }, `第${night.index + 1}夜 ・ ${night.reading}`),
      h('h2', {}, night.name),
      facts,
      h('p', { class: 'muted' }, '今夜のメダルを投入し、手前に落ちた払い出しで持ちメダルを増やす。今夜の収支がノルマに届けば、夜明けにその枚数を月へ上納して次の夜へ。'),
      omen,
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: () => { this.hideAll(); onGo(); } }, '夜をはじめる')));
    this._show('intro', card);
  }

  showDawn(night, reward, bank, onShop) {
    const r = reward;
    const card = h('div', { class: 'card' },
      h('p', { class: 'eyebrow' }, `第${night.index + 1}夜 ・ ${night.name}`),
      h('h2', {}, '夜明け'),
      h('p', {}, `今夜の収支 +${night.paid - night.fromBank}枚 (払い出し ${night.paid} − 追加投入 ${night.fromBank}) / ノルマ ${night.quota}枚`),
      h('div', { class: 'ledger' },
        h('div', {}, h('span', {}, '月へ上納'), h('span', { class: 'num' }, `−${r.tribute}`)),
        h('div', {}, h('span', {}, '夜明けの褒美'), h('span', { class: 'num' }, `+${r.base}`)),
        r.interest ? h('div', {}, h('span', {}, '招福の壺'), h('span', { class: 'num' }, `+${r.interest}`)) : null,
        r.bonus ? h('div', {}, h('span', {}, '千両箱'), h('span', { class: 'num' }, `+${r.bonus}`)) : null,
        r.over ? h('div', {}, h('span', {}, 'ノルマ超過'), h('span', { class: 'num' }, `+${r.over}`)) : null,
        h('div', {}, h('span', {}, '持ちメダル'), h('span', { class: 'num' }, `${bank}枚`))),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: onShop }, '夜店へ')));
    this._show('dawn', card);
  }

  showShop(game) {
    const shop = game.shop;
    const bankEl = h('div', { class: 'shop-bank num' }, h('small', {}, '持ちメダル'), `${game.bank}枚`);
    const item = (it, type) => {
      const def = type === 'charm' ? charmById[it.id] : talismanById[it.id];
      const icon = type === 'charm'
        ? h('span', { class: `seal r${def.rarity}`, 'aria-hidden': 'true' }, def.seal)
        : h('span', { class: 'ofuda', 'aria-hidden': 'true' }, def.seal);
      const can = game.canBuy(it, type);
      let reason = '';
      if (!it.sold && !can) {
        if (game.bank < it.price) reason = 'メダル不足';
        else if (type === 'charm') reason = 'お守りがいっぱい';
        else reason = 'お札がいっぱい';
      }
      return h('div', { class: `item ${it.sold ? 'sold' : ''}` },
        icon,
        h('div', {},
          h('h4', {}, def.name, type === 'charm' ? h('span', { class: 'rar' }, RARITY_NAME[def.rarity]) : null),
          h('p', {}, def.desc),
          it.sold
            ? h('span', { class: 'muted' }, '購入済み')
            : h('button', { class: 'btn gold', disabled: !can, onclick: () => this.on.buy(it, type) }, `${it.price}枚で買う`),
          reason ? h('span', { class: 'reason' }, reason) : null));
    };
    const owned = h('div', { class: 'owned' },
      ...game.charms.map((id, i) => {
        const c = charmById[id];
        return h('div', { class: 'owned-item' }, this._seal(c), h('span', {}, c.name),
          h('button', { class: 'btn', onclick: () => this.on.sell(i) }, `売る +${Math.floor(c.price / 2)}`));
      }));
    if (!game.charms.length) owned.append(h('span', { class: 'muted' }, 'まだお守りはありません。'));
    const next = NIGHTS[game.nightIndex + 1];
    const card = h('div', { class: 'card wide' },
      h('div', { class: 'shop-head' },
        h('div', {}, h('p', { class: 'eyebrow' }, `次は 第${game.nightIndex + 2}夜 ${next.name} ・ ノルマ ${next.quota}枚`), h('h2', {}, '夜店')),
        bankEl),
      h('div', { class: 'shelf-label' }, `お守り (${game.charms.length}/${MAX_CHARMS}) ・ ラン中ずっと効く`),
      h('div', { class: 'shelf' }, ...shop.charms.map((it) => item(it, 'charm'))),
      h('div', { class: 'shelf-label' }, `お札 (${game.talismans.length}/${game.stats.talismanSlots}) ・ 夜の間に一度だけ使える`),
      h('div', { class: 'shelf' }, ...shop.talismans.map((it) => item(it, 'talisman'))),
      h('div', { class: 'shelf-label' }, '手持ちのお守り'),
      owned,
      h('p', { class: 'muted', style: 'margin-top:14px' }, `持ちメダルは、今夜のメダルが尽きた後の追加投入 (${EXTRA_DROPS}回まで) にも使える。`),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', disabled: game.bank < shop.rerollCost, onclick: () => this.on.reroll() }, `品替え (${shop.rerollCost}枚)`),
        h('button', { class: 'btn primary', onclick: () => this.on.leaveShop() }, '次の夜へ')));
    this._show('shop', card);
  }

  showOver(game, onRetry, onTitle) {
    const n = game.night;
    const card = h('div', { class: 'card' },
      h('p', { class: 'eyebrow' }, `第${n.index + 1}夜 ・ ${n.name}`),
      h('h2', {}, '月が雲に隠れた'),
      h('p', {}, `今夜の収支 ${n.paid - n.fromBank}枚。上納ノルマ ${n.quota}枚に届かなかった。`),
      h('div', { class: 'ledger plain' },
        h('div', {}, h('span', {}, '越えた夜'), h('span', { class: 'num' }, `${n.index}夜`)),
        h('div', {}, h('span', {}, 'ラン中の払い出し'), h('span', { class: 'num' }, `${game.run.paid}枚`)),
        h('div', {}, h('span', {}, '投入したメダル'), h('span', { class: 'num' }, `${game.run.dropped}枚`)),
        h('div', {}, h('span', {}, 'ジャックポット'), h('span', { class: 'num' }, `${game.run.jackpots}回`))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: onRetry }, 'もう一度'),
        h('button', { class: 'btn', onclick: onTitle }, 'タイトルへ')));
    this._show('over', card);
  }

  showClear(game, onRetry, onFree, onTitle) {
    const card = h('div', { class: 'card' },
      h('span', { class: 'moon-big', html: moonSvg(1, 96), style: 'display:block;margin:0 auto 8px' }),
      h('p', { class: 'eyebrow' }, '八つの夜を越えて'),
      h('h2', {}, '満月成就'),
      h('p', {}, '月の兎が餅をついて祝っている。'),
      h('div', { class: 'ledger plain' },
        h('div', {}, h('span', {}, 'ラン中の払い出し'), h('span', { class: 'num' }, `${game.run.paid}枚`)),
        h('div', {}, h('span', {}, '投入したメダル'), h('span', { class: 'num' }, `${game.run.dropped}枚`)),
        h('div', {}, h('span', {}, 'ジャックポット'), h('span', { class: 'num' }, `${game.run.jackpots}回`)),
        h('div', {}, h('span', {}, '最後の持ちメダル'), h('span', { class: 'num' }, `${game.bank}枚`))),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: onRetry }, 'もう一度'),
        h('button', { class: 'btn', onclick: onFree }, 'フリープレイへ'),
        h('button', { class: 'btn', onclick: onTitle }, 'タイトルへ')));
    this._show('clear', card);
  }

  showHelp(onBack) {
    const card = h('div', { class: 'card' },
      h('h2', {}, '遊び方'),
      h('ol', { class: 'howto' },
        h('li', {}, '画面をクリック/タップした横位置からメダルを投入。長押しで連続投入、', h('kbd', {}, '←'), h('kbd', {}, '→'), ' と ', h('kbd', {}, 'Space'), ' でも操作できる。'),
        h('li', {}, 'メダルはステージの釘を抜けてプッシャーへ。手前の縁から落ちたメダルが払い出し、横に落ちると没収。'),
        h('li', {}, 'ステージ中央の鳥居をくぐると液晶スロットの抽選。7揃いでジャックポット、月揃いで月玉が出る。'),
        h('li', {}, '各夜には「今夜のメダル」と上納ノルマがある。今夜の収支 (払い出し − 追加投入) がノルマに届けば、夜明けにノルマ分を上納して次の夜へ。届かなければランは終わり。'),
        h('li', {}, `今夜のメダルを使い切ったら、持ちメダルから${EXTRA_DROPS}回まで追加投入できる。追加投入した枚数は今夜の収支から引かれる。最後の投入から数秒たつと夜が明ける。`),
        h('li', {}, '夜明けの後は夜店。上納の残りの持ちメダルで買い物をする。お守りは盤面をずっと変え、お札は夜の間に一度だけ使える (', h('kbd', {}, '1'), '〜', h('kbd', {}, '3'), ')。'),
        h('li', {}, h('kbd', {}, 'V'), ' で視点切替、', h('kbd', {}, 'M'), ' で消音、', h('kbd', {}, 'Esc'), ' でメニュー。')),
      h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: onBack }, 'もどる')));
    this._show('help', card);
  }

  showMenu({ settings, mode, onResume, onTitle, onRestart }) {
    const card = h('div', { class: 'card' },
      h('h2', {}, 'ひと休み'),
      h('div', { class: 'settings-row' }, ...this._settingToggles(settings)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onclick: onResume }, 'つづける'),
        h('button', { class: 'btn', onclick: () => this.showHelp(() => this.showMenu({ settings, mode, onResume, onTitle, onRestart })) }, '遊び方'),
        mode === 'run' ? h('button', { class: 'btn', onclick: onRestart }, 'ランをやり直す') : null,
        h('button', { class: 'btn', onclick: onTitle }, 'タイトルへ (自動保存)')));
    this._show('menu', card);
  }
}
