/**
 * 所有僵尸的静态配置表，以僵尸 id 为键。
 * 每个僵尸对象包含以下字段（部分字段仅特定类型有效）：
 *   - id / name：唯一标识与显示名称
 *   - hp：生命值
 *   - speed：移动速度（像素/秒）
 *   - damage：攻击伤害
 *   - color：Hex 颜色（用于 2D 降级渲染）
 *   - canJump：是否能跳过植物（polevault）
 *   - enrageAt / enrageSpeed / enrageDamage：报纸被打掉后的暴怒阈值与属性（newspaper）
 *   - shieldHp：护盾血量（screendoor）
 *   - undergroundSpeed：地下移动速度（miner）
 *   - summonCooldown：召唤伴舞间隔（dancing）
 */
export const ZOMBIES = {
  basic: {
    id: "basic",
    name: "普通僵尸",
    hp: 220,
    speed: 20,
    damage: 26,
    color: "#8ca27d",
  },
  flag: {
    id: "flag",
    name: "旗帜僵尸",
    hp: 250,
    speed: 22,
    damage: 26,
    color: "#87a37d",
  },
  conehead: {
    id: "conehead",
    name: "路障僵尸",
    hp: 430,
    speed: 19,
    damage: 26,
    color: "#aa9f77",
  },
  buckethead: {
    id: "buckethead",
    name: "铁桶僵尸",
    hp: 780,
    speed: 18,
    damage: 28,
    color: "#8f9597",
  },
  polevault: {
    id: "polevault",
    name: "撑杆僵尸",
    hp: 330,
    speed: 28,
    damage: 25,
    color: "#7b8f67",
    canJump: true,
  },
  newspaper: {
    id: "newspaper",
    name: "读报僵尸",
    hp: 390,
    speed: 16,
    damage: 22,
    color: "#87957d",
    enrageAt: 0.4,
    enrageSpeed: 34,
    enrageDamage: 31,
  },
  screendoor: {
    id: "screendoor",
    name: "铁门僵尸",
    hp: 310,
    shieldHp: 360,
    speed: 17,
    damage: 24,
    color: "#6d7c75",
  },
  football: {
    id: "football",
    name: "橄榄球僵尸",
    hp: 980,
    speed: 26,
    damage: 34,
    color: "#8b4541",
  },
  miner: {
    id: "miner",
    name: "矿工僵尸",
    hp: 320,
    speed: 21,
    damage: 26,
    color: "#857766",
    undergroundSpeed: 58,
  },
  dancing: {
    id: "dancing",
    name: "舞王僵尸",
    hp: 560,
    speed: 20,
    damage: 28,
    color: "#7d7394",
    summonCooldown: 10,
  },
  backup: {
    id: "backup",
    name: "伴舞僵尸",
    hp: 190,
    speed: 21,
    damage: 24,
    color: "#8f8796",
  },
};