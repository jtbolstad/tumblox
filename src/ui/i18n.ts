/**
 * Norwegian (bokmål) translation. The game writes English everywhere; this layer translates what ends up
 * on screen: it rewrites the text of the page, and again whenever the game changes it. Exact strings come
 * from `NB`, strings with numbers or names from `PATTERNS`. English stays the source of truth.
 */
export type Lang = 'en' | 'nb';

const STORAGE_KEY = 'blox.lang.v1';

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'nb') return saved;
  } catch {
    // storage blocked: fall through to the browser language
  }
  return typeof navigator !== 'undefined' && /^(nb|nn|no)\b/i.test(navigator.language) ? 'nb' : 'en';
}

export const lang: Lang = detectLang();

/** The game's name as the title sign spells it. */
export const gameName = (): string => (lang === 'nb' ? 'Tumle' : 'Tumble');

export function setLang(next: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // ignore: the choice just will not stick
  }
  location.reload();
}

const NB: Record<string, string> = {
  // page
  Tumble: 'Tumle',
  Levels: 'Nivåer',
  Close: 'Lukk',
  'Gentle toss': 'Forsiktig dytt',
  'Light throw': 'Lett kast',
  'Strong throw': 'Hardt kast',
  'Full power!': 'Full styrke!',
  'Pick a level': 'Velg et brett',
  'Phone remote': 'Mobil som fjernkontroll',
  'Scan with your phone': 'Skann med mobilen',
  'Waiting for a phone…': 'Venter på en mobil…',
  'A phone cannot open localhost. Start the game with pnpm dev:phone and open the network address.':
    'En mobil kan ikke åpne localhost. Start spillet med pnpm dev:phone og åpne nettverksadressen.',
  'Phone connected': 'Mobil koblet til',
  Connected: 'Koblet til',
  'Could not reach the connection service': 'Fikk ikke kontakt med koblingstjenesten',
  'Hold the phone like a wand and point at the screen to aim. Swipe up on the phone to throw: a faster swipe throws harder.':
    'Hold mobilen som en tryllestav og pek mot skjermen for å sikte. Sveip opp på mobilen for å kaste: raskere sveip gir hardere kast.',
  'Hold the phone like a wand and point at the screen to aim. Swipe up on the phone to throw, or press and hold to charge power.':
    'Hold mobilen som en tryllestav og pek mot skjermen for å sikte. Sveip opp på mobilen for å kaste, eller trykk og hold for å lade styrke.',
  'Swipe to throw, or press and hold': 'Sveip for å kaste, eller trykk og hold',
  'Tilt and turn the phone to aim. A faster swipe throws harder, or hold your finger down to charge. Drag the 🔄 knob to rotate the view.':
    'Vipp og vri mobilen for å sikte. Raskere sveip gir hardere kast, eller hold fingeren nede for å lade. Dra i 🔄-knotten for å rotere kameraet.',
  'Tumble remote': 'Tumle-fjernkontroll',
  'Hold your phone like a wand and point it at the screen.':
    'Hold mobilen som en tryllestav og pek den mot skjermen.',
  Connect: 'Koble til',
  'Connecting…': 'Kobler til…',
  'Connected. Point at the screen.': 'Koblet til. Pek mot skjermen.',
  'Disconnected. Reload the page to connect again.': 'Frakoblet. Last siden på nytt for å koble til igjen.',
  'Could not connect. Is the game open on the other screen?':
    'Fikk ikke koblet til. Er spillet åpent på den andre skjermen?',
  'Motion sensors are needed to aim. Allow them and try again.':
    'Bevegelsessensorer trengs for å sikte. Tillat dem og prøv igjen.',
  'Scan the QR code on the game screen to open this page.':
    'Skann QR-koden på spillskjermen for å åpne denne siden.',
  'Swipe up here to throw': 'Sveip opp her for å kaste',
  'Recenter aim': 'Sentrer siktet',
  'Tilt and turn the phone to aim. A faster swipe throws harder.':
    'Vipp og vri mobilen for å sikte. Raskere sveip gir hardere kast.',
  'Toggle sound': 'Lyd av/på',
  'Sound settings': 'Lydinnstillinger',
  'Graphics quality': 'Grafikkvalitet',
  Language: 'Språk',
  Throws: 'Kast',
  'Score:': 'Poeng:',
  'Number of players': 'Antall spillere',
  'Title screen': 'Tittelskjerm',
  About: 'Om',
  Play: 'Spill',
  'Go on, throw something at the title.': 'Kom igjen, kast noe på tittelen.',
  Result: 'Resultat',
  Retry: 'Prøv igjen',
  'Next level': 'Neste nivå',
  Music: 'Musikk',
  Effects: 'Effekter',
  Voices: 'Stemmer',
  'Touchpad: two-finger swipe to look around, pinch to zoom · Keys: arrows aim · hold Space to throw · Q/E orbit · Z/X zoom · R restart · Enter reset view':
    'Pekeplate: sveip med to fingre for å se deg rundt, knip for å zoome · Taster: piltaster sikter · hold Mellomrom for å kaste · Q/E svinger · Z/X zoomer · R starter på nytt · Enter nullstiller visning',
  'Touchpad: two-finger swipe to look around, pinch to zoom · Keys: arrows aim · hold Space to throw · Q/E orbit · Z/X zoom · R restart':
    'Pekeplate: sveip med to fingre for å se deg rundt, knip for å zoome · Taster: piltaster sikter · hold Mellomrom for å kaste · Q/E svinger · Z/X zoomer · R starter på nytt',
  High: 'Høy',
  Medium: 'Middels',
  Low: 'Lav',
  // results
  'Level cleared!': 'Nivå klart!',
  'Out of throws': 'Tomt for kast',
  'A friend fell off!': 'En venn falt av!',
  'The tower fell!': 'Tårnet falt!',
  'Give it another go.': 'Prøv en gang til.',
  'No medal': 'Ingen medalje',
  Grabs: 'Grep',
  Shots: 'Skudd',
  'Water (s)': 'Vann (s)',
  'solo only': 'kun solo',
  '1 player': '1 spiller',
  'Score duel': 'Poengduell',
  'Jenga-off': 'Jenga-duell',
  'Oh no!': 'Å nei!',
  'Bonk!': 'Bonk!',
  // goals
  'Topple all gems': 'Velt alle juvelene',
  'Clear the board': 'Rydd brettet',
  'Knock every blue gem off the platform': 'Dytt alle blå juveler av plattformen',
  'Clear every block off the platform': 'Rydd alle blokker av plattformen',
  // brief
  'Flick to throw a ball': 'Sveip for å kaste en ball',
  'Flick to throw a heavy ball': 'Sveip for å kaste en tung ball',
  'Flick to throw a bouncy ball': 'Sveip for å kaste en sprettball',
  'Flick to throw: your balls explode when they hit':
    'Sveip for å kaste: ballene dine eksploderer når de treffer',
  'Tap a block to zap it with the laser': 'Trykk på en blokk for å skyte den med laser',
  'Hold down to spray water and push blocks': 'Hold inne for å spyle vann og dytte blokker',
  'Press on a block and drag it out': 'Trykk på en blokk og dra den ut',
  'Red bombs explode when hit hard': 'Røde bomber eksploderer når de treffes hardt',
  'Green chemicals blow up when two of them touch':
    'Grønne kjemikalier sprenges når to av dem berører hverandre',
  'Pink penalty blocks cost 100 if they fall': 'Rosa straffeblokker koster 100 hvis de faller',
  'Purple blocks vanish when hit': 'Lilla blokker forsvinner når de treffes',
  'Dark purple blocks need three hits to vanish': 'Mørklilla blokker trenger tre treff for å forsvinne',
  'Fireworks shoot up and burst when hit': 'Fyrverkeri skyter opp og eksploderer når det treffes',
  'Pink cracked blocks shatter only on a hard hit': 'Rosa sprukne blokker knuser bare ved et hardt treff',
  'Clouds float away once something bumps them': 'Skyer flyter av gårde når noe dytter borti dem',
  'Ice is slippery': 'Is er glatt',
  'Steel is heavy and hard to shift': 'Stål er tungt og vanskelig å flytte',
  'Land gold blocks in the ×2 / ×3 zones for more points':
    'Land gullblokker i ×2 / ×3-sonene for flere poeng',
  // worlds
  Meadow: 'Engen',
  'Tiki Isle': 'Tikiøya',
  'Castle Hill': 'Slottsbakken',
  'Dusty Gulch': 'Støvkløfta',
  'Spooky Manor': 'Spøkelsesgården',
  'Pirate Cove': 'Pirat-vika',
  // tools
  Ball: 'Ball',
  'Heavy ball': 'Tung ball',
  'Bomb ball': 'Bombeball',
  'Bouncy ball': 'Sprettball',
  Laser: 'Laser',
  Hose: 'Slange',
  Grab: 'Grep',
  // levels
  'Bonus Lane': 'Bonusfilen',
  Bullseye: 'Blink',
  'Careful Now': 'Forsiktig nå',
  'Chain Reaction': 'Kjedereaksjon',
  Chemistry: 'Kjemi',
  'Clear Out': 'Rydd ut',
  'Cloud Nine': 'Den sjuende himmel',
  Fireworks: 'Fyrverkeri',
  'First Boom': 'Første smell',
  Fortress: 'Festningen',
  'Gem Tower': 'Juveltårnet',
  'Gem Wall': 'Juvelmuren',
  'Glass House': 'Glasshuset',
  'Gold Rush': 'Gullrush',
  'Gold Towers': 'Gulltårnene',
  'Ice Rink': 'Skøytebanen',
  'Jenga Jr.': 'Jenga Jr.',
  'Jingle Bells': 'Bjelleklang',
  'Over the Wall': 'Over muren',
  Pinpoint: 'Blink treff',
  'Power Wash': 'Høytrykks\u00ADspyling',
  'Pyramid Scheme': 'Pyramidespillet',
  'Soak It': 'Bløtlegg det',
  'Steel Wall': 'Stålmuren',
  'Tall Order': 'Stor oppgave',
  'The Bridge': 'Broen',
  'Vanishing Act': 'Forsvinnings\u00ADnummer', // soft hyphen: the name wraps in the level tiles
  'Zap Tower': 'Zaptårnet',
  'Treasure Tower': 'Skattetårnet',
  'Powder Keg': 'Pulverfatet',
  'Walk the Plank': 'Gå planken',
};

/** Character names, as the briefing uses them (lower case). */
const NB_CREATURE: Record<string, string> = {
  goat: 'geiten',
  hen: 'hønen',
  frog: 'frosken',
  parrot: 'papegøyen',
  'pig squire': 'grisejunkeren',
  armadillo: 'beltedyret',
  bat: 'flaggermusen',
  ghost: 'spøkelset',
  fox: 'reven',
  owl: 'ugla',
  'tiki totem': 'tikitotemet',
  villager: 'landsbybeboeren',
};

const creature = (name: string) => NB_CREATURE[name] ?? name;

const PATTERNS: [RegExp, (...m: string[]) => string][] = [
  [/^Next level \((\d+)\)$/, (_, n) => `Neste nivå (${n})`],
  [/^(\d+)\. (.+)$/, (_, n, name) => `${n}. ${toNorwegian(name)}`],
  [
    /^Score (\d+): gold blocks are worth 100 when they fall$/,
    (_, n) => `Få ${n} poeng: gullblokker er verdt 100 når de faller`,
  ],
  [/^Score (\d+)$/, (_, n) => `Poeng ${n}`],
  [/^Best (\d+)$/, (_, n) => `Rekord ${n}`],
  [/^Pull out (\d+) blocks$/, (_, n) => `Trekk ut ${n} blokker`],
  [
    /^Pull (\d+) blocks out without toppling the tower$/,
    (_, n) => `Trekk ut ${n} blokker uten å velte tårnet`,
  ],
  [/^(\d+) throws?$/, (_, n) => `${n} kast`],
  [/^(\d+) grabs?$/, (_, n) => `${n} grep`],
  [/^(\d+) shots?$/, (_, n) => `${n} skudd`],
  [/^(\d+) seconds of water$/, (_, n) => `${n} sekunder vann`],
  [/^(\d+)\/(\d+) cleared(.*)$/, (_, a, b, rest) => `${a}/${b} klart${rest}`],
  [/^Keep the (.+) on the platform!$/, (_, name) => `Hold ${creature(name)} på plattformen!`],
  [/^Knock the (.+) off for a bonus$/, (_, name) => `Dytt ${creature(name)} av for bonus`],
  [/^Chain ×(\d+)!$/, (_, n) => `Kjede ×${n}!`],
  [/^Starting in (\d+)…$/, (_, n) => `Starter om ${n}…`],
  [/^(P\d)'s turn$/, (_, who) => `${who} sin tur`],
  [/^(P\d)'s turn — wait for yours$/, (_, who) => `${who} sin tur — vent på din`],
  [/^You are (P\d)\. Point at the screen\.$/, (_, who) => `Du er ${who}. Pek mot skjermen.`],
  [/^(P\d) toppled it!$/, (_, who) => `${who} veltet det!`],
  [/^(.+) wins!$/, (_, who) => `${who} vinner!`],
  [/^Tie: (.+)$/, (_, who) => `Uavgjort: ${who}`],
  [
    /^(.+) is the last one standing( \(turn limit reached\))?$/,
    (_, who, limit) => `${who} står igjen som den siste${limit ? ' (rundegrensen nådd)' : ''}`,
  ],
];

/** Norwegian for one piece of text; unknown text comes back unchanged. */
export function toNorwegian(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const lead = text.slice(0, text.indexOf(trimmed));
  const tail = text.slice(lead.length + trimmed.length);
  const known = NB[trimmed];
  if (known !== undefined) return lead + known + tail;
  for (const [re, fn] of PATTERNS) {
    const m = re.exec(trimmed);
    if (m) return lead + fn(...m) + tail;
  }
  if (trimmed.includes(' · ')) {
    const parts = trimmed.split(' · ');
    const out = parts.map(toNorwegian);
    if (out.some((part, i) => part !== parts[i])) return lead + out.join(' · ') + tail;
  }
  return text;
}

/** Translate for the chosen language. */
export const tr = (text: string): string => (lang === 'en' ? text : toNorwegian(text));

const ATTRS = ['aria-label', 'title', 'alt'];

function translateNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? '';
    const out = tr(text);
    if (out !== text) node.nodeValue = out;
    return;
  }
  if (node instanceof Element) {
    for (const attr of ATTRS) {
      const value = node.getAttribute(attr);
      if (value) {
        const out = tr(value);
        if (out !== value) node.setAttribute(attr, out);
      }
    }
    node.childNodes.forEach(translateNode);
  }
}

/** Translate the page now and keep translating whatever the game writes into it. */
export function startTranslating(root: HTMLElement = document.body) {
  if (lang === 'en') return;
  document.documentElement.lang = 'nb';
  document.title = tr(document.title);
  translateNode(root);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes') translateNode(r.target);
      else if (r.type === 'characterData') translateNode(r.target);
      else r.addedNodes.forEach(translateNode);
    }
  }).observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
}
