// Golden Hour: Island Circuit — config.js
// One place for every tuning number, colour and fixed world fact: the sunset
// palette, the volcanic island layout, the runways, the ring courses and the
// flight model. Nothing here is read from the network; the world is the same
// on every run for a given seed, so screenshots are reproducible.

export const GAME_TITLE = 'Basalt Horizon';
export const GAME_SUBTITLE = 'Volcanic airlift over the Ember Isles';

export const CONFIG = {
  // World: a square archipelago, sea level y = 0, terrain up to ~130.
  worldSize: 2400,
  seaLevel: 0,
  seed: 20261126,

  // Sunset palette — terrain, sea and sky are graded from the same warm dusk.
  palette: {
    skyZenith: [0.13, 0.18, 0.38],
    skyMid: [0.55, 0.35, 0.42],
    skyHorizon: [1.0, 0.58, 0.22],
    sunCore: [1.0, 0.85, 0.55],
    fog: [0.98, 0.55, 0.28],
    seaDeep: [0.05, 0.23, 0.35],
    seaShallow: [0.10, 0.45, 0.52],
    sand: [0.87, 0.76, 0.55],
    grass: [0.32, 0.48, 0.22],
    forest: [0.16, 0.32, 0.16],
    rock: [0.23, 0.20, 0.22], // dark basalt on the volcanic slopes
    snow: [0.92, 0.90, 0.88],
    runway: [0.16, 0.16, 0.18],
    runwayMark: [0.95, 0.93, 0.85],
    ringNext: [1.0, 0.62, 0.10],
    ringDone: [0.35, 0.85, 0.45],
  },

  // Steady crosswind from the west: it pushes the aircraft sideways, shows on
  // the HUD, and makes the cliff-strip landing a real decision.
  wind: { x: 5.5, z: 1.5, knots: 11, from: 'W' },

  // Sun hangs low over the western sea so every shot is backlit gold.
  sunDirection: [-0.62, 0.30, -0.42],

  // Flight model (arcade, but throttle and bank discipline matter).
  flight: {
    minSpeed: 0,
    maxSpeed: 92,
    cruiseSpeed: 58,
    stallSpeed: 24,
    throttleAccel: 26,
    drag: 0.22,
    climbRate: 13,
    sinkRate: 9,
    turnRate: 0.55, // rad/s at full bank
    maxBank: 1.15, // rad
    maxPitch: 0.55,
    fuelCapacity: 100,
    fuelBurn: 0.55, // per second at full throttle
    fuelBurnIdle: 0.12,
    damagePerHardHit: 34,
    crashSpeed: 14, // vertical speed that counts as a hard hit
  },

  // Runways: flattened strips. Home is the big island's field; north and east
  // are short island strips for the Island Hop mission.
  runways: [
    { id: 'home', name: 'Home Field', x: -180, z: 120, heading: 0.35, length: 300, width: 26 },
    { id: 'north', name: 'North Isle', x: 420, z: -720, heading: -0.5, length: 220, width: 22 },
    { id: 'east', name: 'East Isle', x: 760, z: 380, heading: 1.2, length: 220, width: 22 },
  ],

  // Ring courses, one per mission: slalom rings hug the volcanic peak, the
  // strait run threads low gates between the islands, the courier run links
  // the isles before the final approach home.
  rings: {
    slalom: [
      { x: -300, y: 120, z: -260 },
      { x: -480, y: 150, z: -420 },
      { x: -560, y: 110, z: -240 },
      { x: -420, y: 165, z: -120 },
      { x: -260, y: 95, z: -300 },
      { x: -360, y: 140, z: -520 },
    ],
    strait: [
      { x: 120, y: 55, z: -180 },
      { x: 300, y: 48, z: -380 },
      { x: 420, y: 52, z: -560 },
      { x: 520, y: 60, z: -680 },
    ],
    courier: [
      { x: 60, y: 80, z: -60 },
      { x: 340, y: 95, z: -300 },
      { x: 620, y: 75, z: -120 },
      { x: 760, y: 90, z: 180 },
      { x: 420, y: 110, z: 420 },
    ],
  },
  ringRadius: 15,

  // Scoring.
  score: { ring: 100, ringTimeBonus: 40, landing: 250, softLandingBonus: 150, mission: 500 },

  // Camera.
  camera: { chaseDistance: 16, chaseHeight: 4.5, smoothing: 4.2 },
};

// Mission catalogue: three sorties with different goals, so one flight is
// never the same decision twice. Each mission names its rings, its landing
// strip (if any), its fuel and its altitude ceiling.
export const MISSIONS = [
  {
    id: 'slalom',
    name: 'Caldera Slalom',
    brief: 'Thread 6 golden rings around the volcanic peak. Fast, clean lines pay a time bonus.',
    rings: 'slalom',
    land: null,
    maxAlt: null,
    fuelStart: 100,
  },
  {
    id: 'strait',
    name: 'Low-Deck Run',
    brief: 'Stay under MAX ALT 80 through the strait gates, then put her down on North Isle.',
    rings: 'strait',
    land: 'north',
    maxAlt: 80,
    fuelStart: 100,
  },
  {
    id: 'courier',
    name: 'Crosswind Landing',
    brief: 'Fly 5 courier rings, then land on the short cliff strip at East Isle in an 11 kt crosswind. Watch the PAPI.',
    rings: 'courier',
    land: 'east',
    maxAlt: null,
    fuelStart: 70,
  },
];
