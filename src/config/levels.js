export const LEVELS = [
  {
    id: 1,
    name: "前院清晨",
    startSun: 225,
    naturalSunInterval: 6.2,
    waves: [
      { time: 7, units: [{ type: "basic", count: 1 }] },
      { time: 16, units: [{ type: "basic", count: 2 }] },
      { time: 29, units: [{ type: "conehead", count: 1 }], bigWave: true },
      { time: 41, units: [{ type: "basic", count: 2 }, { type: "conehead", count: 1 }] },
      { time: 55, units: [{ type: "basic", count: 2 }, { type: "conehead", count: 1 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut"],
  },
  {
    id: 2,
    name: "午后防线",
    startSun: 200,
    naturalSunInterval: 7,
    waves: [
      { time: 4, units: [{ type: "basic", count: 2 }] },
      { time: 11, units: [{ type: "conehead", count: 2 }] },
      { time: 21, units: [{ type: "basic", count: 2 }, { type: "polevault", count: 1 }], bigWave: true },
      { time: 31, units: [{ type: "newspaper", count: 2 }, { type: "conehead", count: 1 }] },
      { time: 43, units: [{ type: "polevault", count: 2 }, { type: "buckethead", count: 1 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "potatomine", "squash", "snowpea", "cherrybomb"],
  },
  {
    id: 3,
    name: "终局草坪",
    startSun: 250,
    naturalSunInterval: 6.8,
    waves: [
      { time: 4, units: [{ type: "conehead", count: 2 }, { type: "basic", count: 2 }] },
      { time: 12, units: [{ type: "screendoor", count: 1 }, { type: "flag", count: 1 }, { type: "basic", count: 2 }] },
      { time: 20, units: [{ type: "newspaper", count: 2 }, { type: "polevault", count: 2 }], bigWave: true },
      { time: 31, units: [{ type: "buckethead", count: 2 }, { type: "conehead", count: 2 }, { type: "flag", count: 1 }] },
      { time: 44, units: [{ type: "buckethead", count: 1 }, { type: "football", count: 1 }, { type: "screendoor", count: 2 }, { type: "polevault", count: 2 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater"],
  },
];