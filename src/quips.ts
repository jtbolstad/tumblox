import type { CharacterKind } from './characters';
import { lang } from './i18n';

/** What a character blurts out when it gets hit: [English, Norwegian]. Each kind has its own, plus some for everyone. */
type Quip = readonly [string, string];

const ANYONE: Quip[] = [
  ['Ouch!', 'Au!'],
  ['Hey, watch it!', 'Hei, se opp!'],
  ['I was sitting there!', 'Jeg satt der!'],
  ['Not the face!', 'Ikke ansiktet!'],
  ['Rude.', 'Frekt.'],
  ['I felt that in my cube.', 'Jeg kjente det helt inn i kuben.'],
  ['Who threw that?!', 'Hvem kastet det?!'],
  ['10/10, would bonk again.', '10/10, kan bonkes igjen.'],
];

export const QUIPS: Record<CharacterKind, Quip[]> = {
  goat: [
    ['Baaad aim!', 'Bææælt sikte!'],
    ['I will not be the scapegoat!', 'Jeg skal ikke være syndebukken!'],
  ],
  hen: [
    ['Bawk-ward!', 'Gak-kelig!'],
    ["I'm no spring chicken!", 'Jeg er ingen vårkylling!'],
  ],
  frog: [
    ['Ribbit... ouch.', 'Kvekk... au.'],
    ["That's toad-ally rude!", 'Det var padde-lig frekt!'],
  ],
  parrot: [
    ['Squawk! Rude!', 'Skrææk! Frekt!'],
    ['Polly wants a doctor!', 'Polly vil ha lege!'],
  ],
  pig: [
    ['Oink! My bacon!', 'Oink! Baconet mitt!'],
    ['Squire down!', 'Junker i bakken!'],
  ],
  armadillo: [
    ['Shell shock!', 'Skallsjokk!'],
    ["I'm rolling with it.", 'Jeg ruller med på det.'],
  ],
  bat: [
    ["I'm blind enough already!", 'Jeg er blind nok fra før!'],
    ['Hanging in there!', 'Henger i!'],
  ],
  ghost: [
    ['That went right through... oh no.', 'Det gikk rett gjennom... å nei.'],
    ['Boo-hoo!', 'Bu-huu!'],
  ],
  fox: [
    ['What does the fox say? Ow!', 'Hva sier reven? Au!'],
    ['Sly, but not that sly.', 'Slu, men ikke så slu.'],
  ],
  owl: [
    ['Whooo did that?!', 'Hvem gjorde det?!'],
    ['Not a hoot of fun!', 'Ikke noe tut og kjør!'],
  ],
  totem: [
    ['The spirits are NOT pleased!', 'Åndene er IKKE fornøyde!'],
    ['Totem-ally unfair!', 'Totem-alt urettferdig!'],
  ],
  human: [
    ['Avast, watch the aim!', 'Akter, se på sikten!'],
    ["That's gonna leave a block-shaped bruise.", 'Det blir et kloss-formet blåmerke.'],
  ],
};

const MISSED: Quip[] = [
  ['Missed me!', 'Bomma!'],
  ['You missed!', 'Traff ikke!'],
  ["Don't aim at me!", 'Ikke sikt på meg!'],
  ['Phew!', 'Puh!'],
  ['Too close!', 'Litt for nært!'],
  ['Nice try!', 'Fint forsøk!'],
  ["Is that all you've got?", 'Er det alt du har?'],
  ['Watch where you throw!', 'Se hvor du kaster!'],
  ['Wide of the mark!', 'Langt unna!'],
  ['Hah! Not even close!', 'Ha! Ikke i nærheten!'],
];

/** Near-miss lines that only one kind would say. */
const MISSED_OWN: Partial<Record<CharacterKind, Quip[]>> = {
  goat: [['Baa-rely a scratch!', 'Bææ-rt en ripe!']],
  fox: [['Too slow, human!', 'For treg, menneske!']],
  owl: [['I saw that coming. Wise, huh?', 'Jeg så den komme. Klokt, ikke sant?']],
  ghost: [['Ha! Right through me!', 'Ha! Rett gjennom meg!']],
  totem: [['The spirits protect me!', 'Åndene beskytter meg!']],
  bat: [['Echolocation never fails!', 'Ekkolokalisering svikter aldri!']],
  frog: [['Leap of faith... not needed!', 'Trengte ikke engang hoppe!']],
};

/** What a character says when a ball whizzes past without hitting. */
export function missFor(kind: CharacterKind, rand: () => number = Math.random): string {
  const own = MISSED_OWN[kind];
  const pool = own && rand() < 0.35 ? own : MISSED;
  const [en, nb] = pool[Math.floor(rand() * pool.length)];
  return lang === 'nb' ? nb : en;
}

/** A random line for this kind: half the time one of its own, otherwise a general one. */
export function quipFor(kind: CharacterKind, rand: () => number = Math.random): string {
  const own = QUIPS[kind];
  const pool = rand() < 0.6 ? own : ANYONE;
  const [en, nb] = pool[Math.floor(rand() * pool.length)];
  return lang === 'nb' ? nb : en;
}

export const ALL_QUIPS: Quip[] = [
  ...ANYONE,
  ...Object.values(QUIPS).flat(),
  ...MISSED,
  ...Object.values(MISSED_OWN).flat(),
];
