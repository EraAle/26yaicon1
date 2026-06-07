// setup/arena.js
// RCON으로 공중 아레나를 자동 생성하는 모듈

const { Rcon } = require('rcon-client')

// 공중 아레나 중심 좌표
const ARENA_X = 1000
const ARENA_Y = 120
const ARENA_Z = 1000

const FLOOR_SIZE = 40
const WALL_HEIGHT = 6
const STAND_ROWS = 3

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

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function buildArena() {
  const rcon = new Rcon(RCON_CONFIG)

  try {
    await rcon.connect()
    console.log('✅ RCON 연결 성공\n')

    const cx = ARENA_X
    const cy = ARENA_Y
    const cz = ARENA_Z
    const half = Math.floor(FLOOR_SIZE / 2)
    const wallTop = cy + WALL_HEIGHT

    console.log('🏟️  공중 아레나 생성 시작...\n')

    // 1단계: 공간 정리
    // Minecraft fill 명령은 한 번에 32768블록 제한이 있으므로 4분할
    console.log('Step 1. 공간 정리 중...')
    const clearHeight = WALL_HEIGHT + STAND_ROWS + 8
    const clearMinX = cx - half - STAND_ROWS - 2
    const clearMaxX = cx + half + STAND_ROWS + 2
    const clearMinZ = cz - half - STAND_ROWS - 2
    const clearMaxZ = cz + half + STAND_ROWS + 2

    const clearRegions = [
      [clearMinX, clearMinZ, cx, cz],
      [cx + 1, clearMinZ, clearMaxX, cz],
      [clearMinX, cz + 1, cx, clearMaxZ],
      [cx + 1, cz + 1, clearMaxX, clearMaxZ],
    ]

    for (const [x1, z1, x2, z2] of clearRegions) {
      await sendCommand(rcon, `fill ${x1} ${cy} ${z1} ${x2} ${cy + clearHeight} ${z2} air`)
      await delay(150)
    }

    // 2단계: 전투 바닥 생성
    console.log('Step 2. 전투 바닥 생성 중...')
    await sendCommand(rcon, `fill ${cx - half} ${cy} ${cz - half} ${cx + half} ${cy} ${cz + half} stone_bricks`)
    await delay(300)

    // 바닥 테두리
    await sendCommand(rcon, `fill ${cx - half} ${cy} ${cz - half} ${cx + half} ${cy} ${cz - half} chiseled_stone_bricks`)
    await sendCommand(rcon, `fill ${cx - half} ${cy} ${cz + half} ${cx + half} ${cy} ${cz + half} chiseled_stone_bricks`)
    await sendCommand(rcon, `fill ${cx - half} ${cy} ${cz - half} ${cx - half} ${cy} ${cz + half} chiseled_stone_bricks`)
    await sendCommand(rcon, `fill ${cx + half} ${cy} ${cz - half} ${cx + half} ${cy} ${cz + half} chiseled_stone_bricks`)
    await delay(300)

    // 3단계: 전투 벽 생성
    // stone_brick_wall 대신 stone_bricks 사용. 버전별 블록명 문제 방지.
    console.log('Step 3. 전투 벽 생성 중...')
    await sendCommand(rcon, `fill ${cx - half} ${cy + 1} ${cz - half} ${cx + half} ${wallTop} ${cz - half} stone_bricks`)
    await sendCommand(rcon, `fill ${cx - half} ${cy + 1} ${cz + half} ${cx + half} ${wallTop} ${cz + half} stone_bricks`)
    await sendCommand(rcon, `fill ${cx - half} ${cy + 1} ${cz - half} ${cx - half} ${wallTop} ${cz + half} stone_bricks`)
    await sendCommand(rcon, `fill ${cx + half} ${cy + 1} ${cz - half} ${cx + half} ${wallTop} ${cz + half} stone_bricks`)
    await delay(300)

    // 모서리 기둥
    for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      await sendCommand(rcon, `fill ${cx + dx} ${cy} ${cz + dz} ${cx + dx} ${wallTop + 1} ${cz + dz} chiseled_stone_bricks`)
    }
    await delay(300)

    // 4단계: 관중석 생성
    console.log('Step 4. 관중석 생성 중...')
    for (let row = 0; row < STAND_ROWS; row++) {
      const standY = wallTop + row
      const offset = half + 1 + row

      await sendCommand(rcon, `fill ${cx - half - row} ${standY} ${cz - offset} ${cx + half + row} ${standY} ${cz - offset} stone_brick_slab`)
      await sendCommand(rcon, `fill ${cx - half - row} ${standY} ${cz + offset} ${cx + half + row} ${standY} ${cz + offset} stone_brick_slab`)
      await sendCommand(rcon, `fill ${cx - offset} ${standY} ${cz - half - row} ${cx - offset} ${standY} ${cz + half + row} stone_brick_slab`)
      await sendCommand(rcon, `fill ${cx + offset} ${standY} ${cz - half - row} ${cx + offset} ${standY} ${cz + half + row} stone_brick_slab`)

      if (standY > wallTop) {
        await sendCommand(rcon, `fill ${cx - half - row} ${wallTop} ${cz - offset} ${cx + half + row} ${standY - 1} ${cz - offset} stone_bricks`)
        await sendCommand(rcon, `fill ${cx - half - row} ${wallTop} ${cz + offset} ${cx + half + row} ${standY - 1} ${cz + offset} stone_bricks`)
        await sendCommand(rcon, `fill ${cx - offset} ${wallTop} ${cz - half - row} ${cx - offset} ${standY - 1} ${cz + half + row} stone_bricks`)
        await sendCommand(rcon, `fill ${cx + offset} ${wallTop} ${cz - half - row} ${cx + offset} ${standY - 1} ${cz + half + row} stone_bricks`)
      }
      await delay(150)
    }

    // 5단계: 조명 설치
    // 공중에서 torch는 애매하므로 glowstone 사용
    console.log('Step 5. 조명 설치 중...')
    const lightY = wallTop + STAND_ROWS + 1
    const lightOffset = half + STAND_ROWS

    for (let i = -half; i <= half; i += 10) {
      await sendCommand(rcon, `setblock ${cx + i} ${lightY} ${cz - lightOffset} glowstone`)
      await sendCommand(rcon, `setblock ${cx + i} ${lightY} ${cz + lightOffset} glowstone`)
      await sendCommand(rcon, `setblock ${cx - lightOffset} ${lightY} ${cz + i} glowstone`)
      await sendCommand(rcon, `setblock ${cx + lightOffset} ${lightY} ${cz + i} glowstone`)
    }

    await sendCommand(rcon, `setblock ${cx} ${cy + 1} ${cz} gold_block`)
    await delay(300)

    // 6단계: 스폰/환경 설정
    console.log('Step 6. 스폰 포인트 및 환경 설정 중...')
    await sendCommand(rcon, `setworldspawn ${cx} ${cy + 1} ${cz}`)
    await sendCommand(rcon, 'gamerule spawnRadius 0')
    await sendCommand(rcon, 'gamerule doMobSpawning false')
    await sendCommand(rcon, 'gamerule doDaylightCycle false')
    await sendCommand(rcon, 'time set day')
    await sendCommand(rcon, 'weather clear')

    console.log('\n✅ 아레나 생성 완료!')
    console.log(`📍 중심 좌표: ${cx}, ${cy}, ${cz}`)
    console.log(`📐 전투 공간: ${FLOOR_SIZE}x${FLOOR_SIZE}`)
    console.log(`👀 관찰 위치 추천: ${cx}, ${cy + 15}, ${cz}`)
  } catch (err) {
    console.error('❌ RCON 오류:', err.message)
  } finally {
    await rcon.end()
  }
}

module.exports = { buildArena, ARENA_X, ARENA_Y, ARENA_Z }
