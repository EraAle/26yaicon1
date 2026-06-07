// setup/levels.js
// RCON으로 Minecraft 서버에 레벨별 몬스터를 소환하는 모듈

const { Rcon } = require('rcon-client')

// arena.js와 같은 기준 좌표
const ARENA_X = 1000
const ARENA_Y = 121
const ARENA_Z = 1000

const LEVELS = {
  1: {
    description: 'Level 1 - 좀비 2마리',
    monsters: [
      { type: 'zombie', x: ARENA_X + 5, y: ARENA_Y, z: ARENA_Z },
      { type: 'zombie', x: ARENA_X - 5, y: ARENA_Y, z: ARENA_Z },
    ]
  },
  2: {
    description: 'Level 2 - 좀비 4마리',
    monsters: [
      { type: 'zombie', x: ARENA_X + 5, y: ARENA_Y, z: ARENA_Z + 5 },
      { type: 'zombie', x: ARENA_X - 5, y: ARENA_Y, z: ARENA_Z + 5 },
      { type: 'zombie', x: ARENA_X + 5, y: ARENA_Y, z: ARENA_Z - 5 },
      { type: 'zombie', x: ARENA_X - 5, y: ARENA_Y, z: ARENA_Z - 5 },
    ]
  },
  3: {
    description: 'Level 3 - 좀비 3마리 + 스켈레톤 1마리',
    monsters: [
      { type: 'zombie', x: ARENA_X + 5, y: ARENA_Y, z: ARENA_Z + 5 },
      { type: 'zombie', x: ARENA_X - 5, y: ARENA_Y, z: ARENA_Z + 5 },
      { type: 'zombie', x: ARENA_X, y: ARENA_Y, z: ARENA_Z + 6 },
      { type: 'skeleton', x: ARENA_X + 8, y: ARENA_Y, z: ARENA_Z },
    ]
  },
  4: {
    description: 'Level 4 - 좀비 4마리 + 스켈레톤 2마리',
    monsters: [
      { type: 'zombie', x: ARENA_X + 5, y: ARENA_Y, z: ARENA_Z + 5 },
      { type: 'zombie', x: ARENA_X - 5, y: ARENA_Y, z: ARENA_Z + 5 },
      { type: 'zombie', x: ARENA_X + 5, y: ARENA_Y, z: ARENA_Z - 5 },
      { type: 'zombie', x: ARENA_X - 5, y: ARENA_Y, z: ARENA_Z - 5 },
      { type: 'skeleton', x: ARENA_X + 8, y: ARENA_Y, z: ARENA_Z },
      { type: 'skeleton', x: ARENA_X - 8, y: ARENA_Y, z: ARENA_Z },
    ]
  },
  5: {
    description: 'Level 5 - 좀비 5마리 + 스켈레톤 2마리 + 거미 1마리',
    monsters: [
      { type: 'zombie', x: ARENA_X + 5, y: ARENA_Y, z: ARENA_Z + 5 },
      { type: 'zombie', x: ARENA_X - 5, y: ARENA_Y, z: ARENA_Z + 5 },
      { type: 'zombie', x: ARENA_X + 5, y: ARENA_Y, z: ARENA_Z - 5 },
      { type: 'zombie', x: ARENA_X - 5, y: ARENA_Y, z: ARENA_Z - 5 },
      { type: 'zombie', x: ARENA_X, y: ARENA_Y, z: ARENA_Z + 7 },
      { type: 'skeleton', x: ARENA_X + 9, y: ARENA_Y, z: ARENA_Z },
      { type: 'skeleton', x: ARENA_X - 9, y: ARENA_Y, z: ARENA_Z },
      { type: 'spider', x: ARENA_X, y: ARENA_Y, z: ARENA_Z - 7 },
    ]
  }
}

const RCON_CONFIG = {
  host: 'localhost',
  port: 25575,
  password: 'minecraft'
}

async function sendCommand(rcon, command) {
  const response = await rcon.send(command)
  console.log(`  [CMD] ${command}`)
  if (response) console.log(`  [RES] ${response}`)
  return response
}

async function spawnLevel(levelNumber) {
  const level = LEVELS[levelNumber]
  if (!level) {
    console.error(`❌ 존재하지 않는 레벨: ${levelNumber} (1~5 중 선택)`)
    process.exit(1)
  }

  console.log(`\n🎮 ${level.description}`)
  console.log(`📦 몬스터 ${level.monsters.length}마리 소환 중...\n`)

  const rcon = new Rcon(RCON_CONFIG)

  try {
    await rcon.connect()
    console.log('✅ RCON 연결 성공\n')

    await sendCommand(rcon, 'kill @e[type=zombie]')
    await sendCommand(rcon, 'kill @e[type=skeleton]')
    await sendCommand(rcon, 'kill @e[type=spider]')

    await sendCommand(rcon, 'gamerule doMobSpawning false')
    await sendCommand(rcon, 'gamerule doDaylightCycle false')
    await sendCommand(rcon, 'time set day')
    await sendCommand(rcon, 'weather clear')
    await sendCommand(rcon, 'difficulty normal')

    // 봇이 아레나 중앙에서 시작하도록 시도. 없으면 무시됨.
    await sendCommand(rcon, `tp JaeeunBot ${ARENA_X} ${ARENA_Y} ${ARENA_Z}`)
    await sendCommand(rcon, `tp BaselineBot ${ARENA_X} ${ARENA_Y} ${ARENA_Z}`)

    for (const mob of level.monsters) {
      const cmd = `summon minecraft:${mob.type} ${mob.x} ${mob.y} ${mob.z}`
      await sendCommand(rcon, cmd)
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    console.log(`\n✅ 레벨 ${levelNumber} 세팅 완료!`)
    console.log(`👾 총 ${level.monsters.length}마리 소환됨`)
  } catch (err) {
    console.error('❌ RCON 오류:', err.message)
  } finally {
    await rcon.end()
  }
}

module.exports = { spawnLevel, LEVELS, ARENA_X, ARENA_Y, ARENA_Z }
