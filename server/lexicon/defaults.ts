// Appendix B and Appendix C of the directive, word for word.
// The Head Scribe can edit every list here from the Desk (rule 16.6); these are version 1.

/** Appendix B — crumbs: function words worth 1 manna that can never bring a player home. */
export const CRUMBS: string[] = `
a about after against albeit all also although am among an and any are aren't art as at be because been before
being between both but by can can't cannot canst could couldest couldn't couldst did didn't didst do does doesn't
doest doeth don't done dost doth each either even every for from had hadn't hadst has hasn't hast hath have
haven't having he he's hence her here hereafter hereby herein hereof heretofore hers herself him himself his
hither how howbeit howsoever i i'll i'm i've if in into is isn't it it's its itself lest let's lo may mayest me might
mightest mine more most must my myself nay neither no nor not notwithstanding now o of off oh on only onto
or other our ours ourselves out over own shall shalt she she's should shouldest shouldn't shouldst so some such than
that that's the thee their theirs them themselves then thence there there's thereby therefore therein thereof thereto
thereunto thereupon therewith these they they'll they're thine this thither those thou though through thus thy
thyself till to too under until unto up upon us very was wasn't wast we we'll we're were weren't wert what what's
whatever whatsoever when whence whensoever where whereas whereby wherefore wherein whereof wheresoever
whereunto whereupon wherewith wherewithal whether which while whilst whither whithersoever who who's
whoever whom whomsoever whose whosoever why will wilt with within without won't would wouldest wouldn't
wouldst ye yea yet you you'll you're you've your yours yourself yourselves
`.trim().split(/\s+/);

/** Appendix C — irregular forms. Each base joins the forms on the right, and all of their regular endings. */
export const IRREGULARS: Record<string, string[]> = Object.fromEntries(
  `
arise: arose arisen | awake: awoke | beat: beaten | become: became | beget: begat begotten | begin: began begun
behold: beheld | bend: bent | beseech: besought | bid: bade bidden | bind: bound | bite: bitten | blow: blew blown
break: brake broke broken | breed: bred | bring: brought | brother: brethren | build: built | burn: burnt
buy: bought | catch: caught | child: children | choose: chose chosen | cleave: clave | clothe: clad | come: came
cow: kine | creep: crept | dig: dug | draw: drew drawn | drink: drank drunk | drive: driven | dwell: dwelt
eat: ate eaten | fall: fell fallen | feed: fed | feel: felt | fight: fought | find: found | flee: fled | fly: flew
foot: feet | forbid: forbade forbidden | forget: forgot forgotten | forgive: forgave forgiven
forsake: forsook forsaken | get: gat got gotten | give: gave given | go: went gone | grow: grew grown | hang: hung
hear: heard | help: holpen | hew: hewn | hide: hid hidden | hold: held | keep: kept | kneel: knelt
know: knew known | lade: laden | lay: laid | lead: led | lend: lent | lie: lain | light: lit | lose: lost
make: made | man: men | mean: meant | meet: met | melt: molten | mouse: mice | overcome: overcame | ox: oxen
pay: paid | rend: rent | ride: rode ridden | rise: rose risen | run: ran | say: said saith | see: saw seen
seek: sought | seethe: sod sodden | sell: sold | send: sent | shake: shook shaken | shape: shapen | shine: shone
shoot: shot | sing: sang sung | sink: sank sunk | sit: sat | slay: slew slain | sleep: slept | smite: smote smitten
sow: sown | speak: spake spoke spoken | spend: spent | spin: spun | spring: sprang sprung | stand: stood
steal: stole stolen | strike: struck stricken | strive: strove striven | swear: sware swore sworn | sweep: swept
take: took taken | teach: taught | tear: tore torn | tell: told | think: thought | throw: threw thrown
tooth: teeth | tread: trod trodden | understand: understood | wake: woke | wear: wore worn | weave: wove woven
weep: wept | win: won | withdraw: withdrew withdrawn | withhold: withheld | withstand: withstood
woman: women | work: wrought | wring: wrung | write: wrote written
`
    .trim()
    .split(/\s*[|\n]\s*/)
    .filter(Boolean)
    .map((entry) => {
      const [base, forms] = entry.split(':');
      return [base.trim(), forms.trim().split(/\s+/)] as [string, string[]];
    }),
);

/** Appendix C — spelling variants. Each pair is one word. */
export const VARIANTS: [string, string][] = `
honour=honor honourable=honorable saviour=savior neighbour=neighbor labour=labor favour=favor colour=color
behaviour=behavior odour=odor vapour=vapor rumour=rumor armour=armor clamour=clamor valour=valor grey=gray
plough=plow shew=show ensample=example throughly=thoroughly counsellor=counselor traveller=traveler
marvellous=marvelous worshipper=worshiper offence=offense defence=defense fulfil=fulfill fulness=fullness
skilful=skillful
`
  .trim()
  .split(/\s+/)
  .map((p) => p.split('=') as [string, string]);

/** Appendix C — never stem. Regular endings never join these to a shorter word. */
export const NEVER_STEM: string[] = `
news earring earrings wicked crooked wretched earnest forest seed feed deed need heed weed reed speed creed greed
bleed breed indeed judas annas king evening doing being
`.trim().split(/\s+/);

// "Kept apart on purpose" (left, ground, wound, drove, bit, lay, bare, bore, born, borne, cleft, graven) needs no
// list: those homographs are simply absent from the irregular table above.

export interface LexiconConfig {
  crumbs: string[];
  irregulars: Record<string, string[]>;
  variants: [string, string][];
  neverStem: string[];
  /** Forms split out of their family by a Scribe (rule 16.6). */
  split: string[];
  /** Families joined by a Scribe, as pairs of words. */
  joins: [string, string][];
  /** Families pinned to a tier, with the reason. */
  pins: Record<string, { tier: 'crumb' | 'loaf' | 'fish' | 'pearl'; reason: string }>;
  /** The feature switch "irregular forms" from The Law (rule 16.7). */
  useIrregulars: boolean;
}

export function defaultLexiconConfig(): LexiconConfig {
  return {
    crumbs: [...CRUMBS],
    irregulars: Object.fromEntries(Object.entries(IRREGULARS).map(([k, v]) => [k, [...v]])),
    variants: VARIANTS.map((p) => [...p] as [string, string]),
    neverStem: [...NEVER_STEM],
    split: [],
    joins: [],
    pins: {},
    useIrregulars: true,
  };
}
