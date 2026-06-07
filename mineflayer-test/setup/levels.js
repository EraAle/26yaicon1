// setup/levels.js
// RCON으로 Minecraft 서버에 레벨별 몬스터를 소환하는 모듈

const { Rcon } = require('rcon-client')

// ─────────────────────────────────────────
// 레벨 정의
// 봇 스폰 위치 기준으로 몬스터를 주변에 소환
// 좌표는 아레나 맵 올린 뒤 직접 수정 필요
// ─────────────────────────────────────────
const LEVELS = {
  1: {
    description: 'Level 1 - 좀비 2마리 (기본 동작 확인)',
    monsters: [
      { type: 'zombie', x: 5,  y: 66, z: 0  },
      { type: 'zombie', x: -5, y: 66, z: 0  },
    ]
  },
  2: {
    description: 'Level 2 - 좀비 4마리 (다수 처리)',
    monsters: [
      { type: 'zombie', x: 5,  y: 66, z: 5  },
      { type: 'zombie', x: -5, y: 66, z: 5  },
      { type: 'zombie', x: 5,  y: 66, z: -5 },
      { type: 'zombie', x: -5, y: 66, z: -5 },
    ]
  },
  3: {
    description: 'Level 3 - 좀비 3마리 + 스켈레톤 1마리 (원거리 대응)',
    monsters: [
      { type: 'zombie',   x: 5,  y: 66, z: 5  },
      { type: 'zombie',   x: -5, y: 66, z: 5  },
      { type: 'zombie',   x: 0,  y: 66, z: 6  },
      { type: 'skeleton', x: 8,  y: 66, z: 0  },
    ]
  },
  4: {
    description: 'Level 4 - 좀비 4마리 + 스켈레톤 2마리 (복합 전투)',
    monsters: [
      { type: 'zombie',   x: 5,  y: 66, z: 5  },
      { type: 'zombie',   x: -5, y: 66, z: 5  },
      { type: 'zombie',   x: 5,  y: 66, z: -5 },
      { type: 'zombie',   x: -5, y: 66, z: -5 },
      { type: 'skeleton', x: 8,  y: 66, z: 0  },
      { type: 'skeleton', x: -8, y: 66, z: 0  },
    ]
  },
  5: {
    description: 'Level 5 - 좀비 5마리 + 스켈레톤 2마리 + 거미 1마리 (최종)',
    monsters: [
      { type: 'zombie',   x: 5,  y: 66, z: 5  },
      { type: 'zombie',   x: -5, y: 66, z: 5  },
      { type: 'zombie',   x: 5,  y: 66, z: -5 },
      { type: 'zombie',   x: -5, y: 66, z: -5 },
      { type: 'zombie',   x: 0,  y: 66, z: 7  },
      { type: 'skeleton', x: 9,  y: 66, z: 0  },
      { type: 'skeleton', x: -9, y: 66, z: 0  },
      { type: 'spider',   x: 0,  y: 66, z: -7 },
    ]
  }
}

// ─────────────────────────────────────────
// RCON 연결 설정
// docker-compose.yml의 RCON 설정과 맞춰야 함
// ─────────────────────────────────────────
const RCON_CONFIG = {
  host: 'localhost',
  port: 25575,
  password: 'minecraft' // docker-compose.yml의 RCON_PASSWORD와 동일하게
}

// RCON으로 명령어 실행
async function sendCommand(rcon, command) {
  const response = await rcon.send(command)
  console.log(`  [CMD] ${command}`)
  if (response) console.log(`  [RES] ${response}`)
  return response
}

// 레벨에 맞는 몬스터 소환
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

    // 기존 몬스터 제거 (이전 테스트 잔여 몬스터 정리)
    await sendCommand(rcon, '/kill @e[type=zombie]')
    await sendCommand(rcon, '/kill @e[type=skeleton]')
    await sendCommand(rcon, '/kill @e[type=spider]')

    // 게임 규칙 설정 (자연 스폰 방지)
    await sendCommand(rcon, '/gamerule doMobSpawning false')

    // 난이도 설정
    await sendCommand(rcon, '/difficulty normal')

    // 레벨별 몬스터 소환
    for (const mob of level.monsters) {
      const cmd = `/summon minecraft:${mob.type} ${mob.x} ${mob.y} ${mob.z}`
      await sendCommand(rcon, cmd)
      // 한 번에 너무 빠르게 소환하면 서버 부하 방지
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    console.log(`\n✅ 레벨 ${levelNumber} 세팅 완료!`)
    console.log(`👾 총 ${level.monsters.length}마리 소환됨`)

  } catch (err) {
    console.error('❌ RCON 오류:', err.message)
    console.error('→ docker-compose.yml에 RCON 설정이 되어있는지 확인하세요')
  } finally {
    await rcon.end()
  }
}

module.exports = { spawnLevel, LEVELS }
