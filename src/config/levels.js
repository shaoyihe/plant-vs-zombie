/**
 * 关卡配置列表。
 * 每个关卡包含：
 *   - id / name：关卡编号与名称
 *   - startSun：初始阳光值
 *   - naturalSunInterval：天降阳光的间隔秒数
 *   - waves：波次数组，每波包含触发时间 time（秒）、生成单位 units 以及是否为大波次 bigWave
 *   - unlockPlants：本关可使用的植物 id 列表
 */
export const CHAPTERS = [
  { id: 1, name: "晨曦篇", startLevel: 1, endLevel: 4 },
  { id: 2, name: "攻坚篇", startLevel: 5, endLevel: 8 },
  { id: 3, name: "终章篇", startLevel: 9, endLevel: 12 },
];

export const LEVELS = [
  {
    id: 1,
    name: "前院清晨",
    startSun: 225,
    naturalSunInterval: 6.2,
    waves: [
      { time: 7, units: [{ type: "basic", count: 1 }] },
      { time: 20, units: [{ type: "basic", count: 2 }] },
      { time: 35, units: [{ type: "basic", count: 2 }, { type: "conehead", count: 1 }] },
      { time: 52, units: [{ type: "basic", count: 3 }] },
      { time: 69, units: [{ type: "conehead", count: 2 }], bigWave: true },
      { time: 86, units: [{ type: "basic", count: 3 }, { type: "conehead", count: 1 }] },
      { time: 104, units: [{ type: "basic", count: 4 }, { type: "conehead", count: 2 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut"],
  },
  {
    id: 2,
    name: "午后防线",
    startSun: 200,
    naturalSunInterval: 7,
    waves: [
      { time: 8, units: [{ type: "basic", count: 2 }] },
      { time: 23, units: [{ type: "conehead", count: 2 }] },
      { time: 39, units: [{ type: "basic", count: 2 }, { type: "polevault", count: 1 }] },
      { time: 56, units: [{ type: "newspaper", count: 1 }, { type: "conehead", count: 2 }] },
      { time: 74, units: [{ type: "polevault", count: 2 }, { type: "conehead", count: 2 }], bigWave: true },
      { time: 93, units: [{ type: "newspaper", count: 2 }, { type: "basic", count: 3 }] },
      { time: 115, units: [{ type: "polevault", count: 2 }, { type: "buckethead", count: 1 }, { type: "conehead", count: 2 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "potatomine", "squash", "snowpea", "cherrybomb", "chomper"],
  },
  {
    id: 3,
    name: "中庭试炼",
    startSun: 225,
    naturalSunInterval: 6.9,
    waves: [
      { time: 8, units: [{ type: "basic", count: 2 }, { type: "conehead", count: 1 }] },
      { time: 24, units: [{ type: "polevault", count: 1 }, { type: "newspaper", count: 1 }, { type: "basic", count: 2 }] },
      { time: 41, units: [{ type: "conehead", count: 3 }, { type: "buckethead", count: 1 }] },
      { time: 59, units: [{ type: "newspaper", count: 2 }, { type: "polevault", count: 2 }], bigWave: true },
      { time: 77, units: [{ type: "buckethead", count: 2 }, { type: "conehead", count: 2 }] },
      { time: 96, units: [{ type: "screendoor", count: 1 }, { type: "newspaper", count: 2 }, { type: "basic", count: 3 }] },
      { time: 118, units: [{ type: "buckethead", count: 2 }, { type: "polevault", count: 2 }, { type: "screendoor", count: 1 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "potatomine", "squash", "snowpea", "cherrybomb", "chomper", "repeater"],
  },
  {
    id: 4,
    name: "斜阳突围",
    startSun: 250,
    naturalSunInterval: 6.8,
    waves: [
      { time: 9, units: [{ type: "conehead", count: 2 }, { type: "basic", count: 2 }] },
      { time: 25, units: [{ type: "screendoor", count: 1 }, { type: "flag", count: 1 }, { type: "basic", count: 2 }] },
      { time: 42, units: [{ type: "newspaper", count: 2 }, { type: "polevault", count: 2 }] },
      { time: 60, units: [{ type: "buckethead", count: 2 }, { type: "conehead", count: 2 }, { type: "flag", count: 1 }], bigWave: true },
      { time: 79, units: [{ type: "screendoor", count: 2 }, { type: "newspaper", count: 2 }, { type: "polevault", count: 1 }] },
      { time: 99, units: [{ type: "buckethead", count: 2 }, { type: "flag", count: 2 }, { type: "polevault", count: 2 }] },
      { time: 121, units: [{ type: "football", count: 1 }, { type: "screendoor", count: 2 }, { type: "buckethead", count: 2 }], bigWave: true },
      { time: 144, units: [{ type: "football", count: 1 }, { type: "buckethead", count: 2 }, { type: "screendoor", count: 2 }, { type: "flag", count: 2 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater"],
  },
  {
    id: 5,
    name: "矿道来袭",
    startSun: 250,
    naturalSunInterval: 6.8,
    waves: [
      { time: 10, units: [{ type: "conehead", count: 2 }, { type: "basic", count: 2 }] },
      { time: 27, units: [{ type: "miner", count: 1 }, { type: "flag", count: 1 }, { type: "basic", count: 2 }] },
      { time: 46, units: [{ type: "newspaper", count: 2 }, { type: "polevault", count: 2 }, { type: "miner", count: 1 }] },
      { time: 66, units: [{ type: "buckethead", count: 2 }, { type: "conehead", count: 2 }, { type: "miner", count: 1 }], bigWave: true },
      { time: 86, units: [{ type: "screendoor", count: 1 }, { type: "miner", count: 2 }, { type: "polevault", count: 2 }] },
      { time: 108, units: [{ type: "football", count: 1 }, { type: "buckethead", count: 2 }, { type: "flag", count: 2 }] },
      { time: 131, units: [{ type: "screendoor", count: 2 }, { type: "football", count: 1 }, { type: "miner", count: 2 }], bigWave: true },
      { time: 154, units: [{ type: "football", count: 2 }, { type: "miner", count: 2 }, { type: "buckethead", count: 2 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater", "threepeater", "torchwood"],
  },
  {
    id: 6,
    name: "铁门阵线",
    startSun: 275,
    naturalSunInterval: 6.6,
    waves: [
      { time: 10, units: [{ type: "screendoor", count: 1 }, { type: "conehead", count: 2 }, { type: "basic", count: 2 }] },
      { time: 28, units: [{ type: "buckethead", count: 2 }, { type: "newspaper", count: 2 }] },
      { time: 48, units: [{ type: "screendoor", count: 2 }, { type: "polevault", count: 2 }, { type: "flag", count: 1 }] },
      { time: 69, units: [{ type: "football", count: 1 }, { type: "buckethead", count: 2 }, { type: "miner", count: 1 }], bigWave: true },
      { time: 91, units: [{ type: "screendoor", count: 2 }, { type: "football", count: 1 }, { type: "flag", count: 2 }] },
      { time: 114, units: [{ type: "buckethead", count: 3 }, { type: "polevault", count: 2 }, { type: "miner", count: 1 }] },
      { time: 138, units: [{ type: "football", count: 2 }, { type: "screendoor", count: 2 }, { type: "buckethead", count: 2 }], bigWave: true },
      { time: 162, units: [{ type: "football", count: 2 }, { type: "screendoor", count: 2 }, { type: "buckethead", count: 3 }, { type: "miner", count: 1 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater", "threepeater", "torchwood", "magnetshroom"],
  },
  {
    id: 7,
    name: "舞王夜袭",
    startSun: 300,
    naturalSunInterval: 6.5,
    waves: [
      { time: 12, units: [{ type: "flag", count: 1 }, { type: "conehead", count: 2 }, { type: "basic", count: 2 }] },
      { time: 31, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 2 }, { type: "newspaper", count: 2 }] },
      { time: 51, units: [{ type: "football", count: 1 }, { type: "buckethead", count: 2 }, { type: "miner", count: 1 }] },
      { time: 72, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "screendoor", count: 1 }], bigWave: true },
      { time: 94, units: [{ type: "football", count: 2 }, { type: "buckethead", count: 2 }, { type: "flag", count: 2 }] },
      { time: 117, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "miner", count: 2 }] },
      { time: 141, units: [{ type: "football", count: 2 }, { type: "screendoor", count: 2 }, { type: "dancing", count: 1 }, { type: "backup", count: 4 }], bigWave: true },
      { time: 166, units: [{ type: "football", count: 2 }, { type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "miner", count: 2 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater", "threepeater", "torchwood", "magnetshroom", "iceshroom"],
  },
  {
    id: 8,
    name: "终局草坪",
    startSun: 325,
    naturalSunInterval: 6.3,
    waves: [
      { time: 12, units: [{ type: "flag", count: 1 }, { type: "conehead", count: 2 }, { type: "basic", count: 3 }] },
      { time: 33, units: [{ type: "screendoor", count: 2 }, { type: "miner", count: 2 }, { type: "polevault", count: 2 }] },
      { time: 54, units: [{ type: "football", count: 1 }, { type: "buckethead", count: 2 }, { type: "dancing", count: 1 }, { type: "backup", count: 2 }] },
      { time: 76, units: [{ type: "screendoor", count: 2 }, { type: "football", count: 1 }, { type: "miner", count: 2 }, { type: "flag", count: 1 }], bigWave: true },
      { time: 99, units: [{ type: "buckethead", count: 3 }, { type: "dancing", count: 1 }, { type: "backup", count: 4 }] },
      { time: 123, units: [{ type: "football", count: 2 }, { type: "screendoor", count: 2 }, { type: "miner", count: 2 }] },
      { time: 148, units: [{ type: "buckethead", count: 3 }, { type: "football", count: 2 }, { type: "dancing", count: 1 }, { type: "backup", count: 4 }] },
      { time: 174, units: [{ type: "buckethead", count: 3 }, { type: "football", count: 2 }, { type: "dancing", count: 1 }, { type: "screendoor", count: 2 }, { type: "polevault", count: 2 }, { type: "miner", count: 2 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater", "threepeater", "torchwood", "magnetshroom", "iceshroom", "doomshroom", "chomper"],
  },
  {
    id: 9,
    name: "灰烬前线",
    startSun: 325,
    naturalSunInterval: 6.2,
    waves: [
      { time: 12, units: [{ type: "flag", count: 1 }, { type: "conehead", count: 3 }, { type: "basic", count: 3 }] },
      { time: 34, units: [{ type: "screendoor", count: 2 }, { type: "polevault", count: 2 }, { type: "miner", count: 2 }] },
      { time: 57, units: [{ type: "football", count: 1 }, { type: "buckethead", count: 3 }, { type: "newspaper", count: 2 }] },
      { time: 80, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "screendoor", count: 2 }], bigWave: true },
      { time: 104, units: [{ type: "football", count: 2 }, { type: "miner", count: 2 }, { type: "buckethead", count: 3 }] },
      { time: 129, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "football", count: 2 }] },
      { time: 155, units: [{ type: "screendoor", count: 2 }, { type: "football", count: 2 }, { type: "miner", count: 3 }] },
      { time: 182, units: [{ type: "buckethead", count: 4 }, { type: "football", count: 2 }, { type: "dancing", count: 1 }, { type: "backup", count: 4 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater", "threepeater", "torchwood", "magnetshroom", "iceshroom", "doomshroom", "chomper"],
  },
  {
    id: 10,
    name: "深夜重压",
    startSun: 350,
    naturalSunInterval: 6.1,
    waves: [
      { time: 13, units: [{ type: "flag", count: 1 }, { type: "conehead", count: 3 }, { type: "basic", count: 3 }] },
      { time: 36, units: [{ type: "buckethead", count: 2 }, { type: "screendoor", count: 2 }, { type: "polevault", count: 2 }] },
      { time: 60, units: [{ type: "football", count: 2 }, { type: "miner", count: 2 }, { type: "newspaper", count: 2 }] },
      { time: 84, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "screendoor", count: 2 }], bigWave: true },
      { time: 109, units: [{ type: "football", count: 2 }, { type: "buckethead", count: 3 }, { type: "miner", count: 2 }] },
      { time: 135, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "football", count: 2 }, { type: "flag", count: 1 }] },
      { time: 162, units: [{ type: "screendoor", count: 3 }, { type: "miner", count: 3 }, { type: "buckethead", count: 3 }] },
      { time: 190, units: [{ type: "football", count: 3 }, { type: "buckethead", count: 4 }, { type: "dancing", count: 1 }, { type: "backup", count: 4 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater", "threepeater", "torchwood", "magnetshroom", "iceshroom", "doomshroom", "chomper"],
  },
  {
    id: 11,
    name: "尾声守城",
    startSun: 350,
    naturalSunInterval: 6,
    waves: [
      { time: 14, units: [{ type: "flag", count: 1 }, { type: "conehead", count: 3 }, { type: "basic", count: 4 }] },
      { time: 38, units: [{ type: "buckethead", count: 2 }, { type: "screendoor", count: 2 }, { type: "polevault", count: 2 }] },
      { time: 63, units: [{ type: "football", count: 2 }, { type: "miner", count: 2 }, { type: "newspaper", count: 3 }] },
      { time: 88, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "screendoor", count: 2 }], bigWave: true },
      { time: 114, units: [{ type: "football", count: 2 }, { type: "buckethead", count: 3 }, { type: "miner", count: 2 }, { type: "flag", count: 1 }] },
      { time: 141, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "football", count: 2 }, { type: "screendoor", count: 2 }] },
      { time: 169, units: [{ type: "screendoor", count: 3 }, { type: "miner", count: 3 }, { type: "buckethead", count: 4 }] },
      { time: 198, units: [{ type: "football", count: 3 }, { type: "buckethead", count: 4 }, { type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "miner", count: 2 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater", "threepeater", "torchwood", "magnetshroom", "iceshroom", "doomshroom", "chomper"],
  },
  {
    id: 12,
    name: "终章决战",
    startSun: 375,
    naturalSunInterval: 5.9,
    waves: [
      { time: 15, units: [{ type: "flag", count: 1 }, { type: "conehead", count: 4 }, { type: "basic", count: 4 }] },
      { time: 40, units: [{ type: "buckethead", count: 2 }, { type: "screendoor", count: 2 }, { type: "polevault", count: 3 }] },
      { time: 66, units: [{ type: "football", count: 2 }, { type: "miner", count: 3 }, { type: "newspaper", count: 3 }] },
      { time: 92, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "screendoor", count: 2 }, { type: "flag", count: 1 }], bigWave: true },
      { time: 119, units: [{ type: "football", count: 3 }, { type: "buckethead", count: 3 }, { type: "miner", count: 3 }] },
      { time: 147, units: [{ type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "football", count: 2 }, { type: "screendoor", count: 2 }] },
      { time: 176, units: [{ type: "screendoor", count: 3 }, { type: "miner", count: 3 }, { type: "buckethead", count: 4 }, { type: "polevault", count: 2 }] },
      { time: 206, units: [{ type: "football", count: 3 }, { type: "buckethead", count: 4 }, { type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "miner", count: 3 }], bigWave: true },
      { time: 236, units: [{ type: "football", count: 4 }, { type: "buckethead", count: 4 }, { type: "dancing", count: 1 }, { type: "backup", count: 4 }, { type: "screendoor", count: 3 }, { type: "miner", count: 3 }], bigWave: true },
    ],
    unlockPlants: ["sunflower", "peashooter", "wallnut", "tallnut", "potatomine", "squash", "spikeweed", "snowpea", "cherrybomb", "repeater", "threepeater", "torchwood", "magnetshroom", "iceshroom", "doomshroom", "chomper"],
  },
];

export function getChapterForLevel(levelOrIndex) {
  const levelNumber = typeof levelOrIndex === "number" ? levelOrIndex + 1 : levelOrIndex?.id;
  return CHAPTERS.find((chapter) => levelNumber >= chapter.startLevel && levelNumber <= chapter.endLevel) || CHAPTERS[0];
}

export function formatLevelShortLabel(levelOrIndex) {
  const levelNumber = typeof levelOrIndex === "number" ? levelOrIndex + 1 : levelOrIndex?.id;
  const chapter = getChapterForLevel(levelOrIndex);
  const chapterLevel = levelNumber - chapter.startLevel + 1;
  return `${chapter.id}-${chapterLevel}`;
}

export function formatLevelFullLabel(levelOrIndex) {
  const levelNumber = typeof levelOrIndex === "number" ? levelOrIndex + 1 : levelOrIndex?.id;
  const chapter = getChapterForLevel(levelOrIndex);
  const chapterLevel = levelNumber - chapter.startLevel + 1;
  return `第${chapter.id}章 ${chapter.name} · 第${chapterLevel}关`;
}