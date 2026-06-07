// setup/arena.js
// RCON으로 아레나를 자동 생성하는 모듈
//
// 구조:
//   - 전투 바닥: 40x40 석재
//   - 전투 벽: 높이 6 돌담
//   - 관중석: 4면 3단 계단식 (벽 위에서 시작)
//   - 조명: 관중석 상단 횃불
//   - 스폰 위치: 아레나 중앙

const { Rcon } = require('rcon-client')

// ─────────────────────────────────────────
// 아레나 중심 좌표 설정
// ─────────────────────────────────────────
const ARENA_X = 0
const ARENA_Y = 65   // 지면 높이
const ARENA_Z = 0

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

    console.log('🏟️  아레나 생성 시작...\n')

    // ─────────────────────────────────────
    // 1단계: 공간 정리
    // ─────────────────────────────────────
    console.log('Step 1. 공간 정리 중...')
    const clearHeight = WALL_HEIGHT + STAND_ROWS + 5
    await sendCommand(rcon,
      `fill ${cx-half-STAND_ROWS-2} ${cy} ${cz-half-STAND_ROWS-2} ${cx+half+STAND_ROWS+2} ${cy+clearHeight} ${cz+half+STAND_ROWS+2} air`
    )
    await delay(500)

    // ─────────────────────────────────────
    // 2단계: 전투 바닥 생성
    // ─────────────────────────────────────
    console.log('Step 2. 전투 바닥 생성 중...')
    await sendCommand(rcon,
      `fill ${cx-half} ${cy} ${cz-half} ${cx+half} ${cy} ${cz+half} stone_bricks`
    )
    await delay(300)
    // 바닥 테두리
    await sendCommand(rcon, `fill ${cx-half} ${cy} ${cz-half} ${cx+half} ${cy} ${cz-half} chiseled_stone_bricks`)
    await sendCommand(rcon, `fill ${cx-half} ${cy} ${cz+half} ${cx+half} ${cy} ${cz+half} chiseled_stone_bricks`)
    await sendCommand(rcon, `fill ${cx-half} ${cy} ${cz-half} ${cx-half} ${cy} ${cz+half} chiseled_stone_bricks`)
    await sendCommand(rcon, `fill ${cx+half} ${cy} ${cz-half} ${cx+half} ${cy} ${cz+half} chiseled_stone_bricks`)
    await delay(300)

    // ─────────────────────────────────────
    // 3단계: 전투 벽 생성
    // ─────────────────────────────────────
    console.log('Step 3. 전투 벽 생성 중...')
    await sendCommand(rcon, `fill ${cx-half} ${cy+1} ${cz-half} ${cx+half} ${wallTop} ${cz-half} stone_brick_wall`)
    await sendCommand(rcon, `fill ${cx-half} ${cy+1} ${cz+half} ${cx+half} ${wallTop} ${cz+half} stone_brick_wall`)
    await sendCommand(rcon, `fill ${cx-half} ${cy+1} ${cz-half} ${cx-half} ${wallTop} ${cz+half} stone_brick_wall`)
    await sendCommand(rcon, `fill ${cx+half} ${cy+1} ${cz-half} ${cx+half} ${wallTop} ${cz+half} stone_brick_wall`)
    await delay(300)

    // 모서리 기둥
    for (const [dx, dz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      await sendCommand(rcon, `fill ${cx+dx} ${cy} ${cz+dz} ${cx+dx} ${wallTop+1} ${cz+dz} chiseled_stone_bricks`)
    }
    await delay(300)

    // ─────────────────────────────────────
    // 4단계: 관중석 생성 (벽 위에서 계단식)
    // ─────────────────────────────────────
    console.log('Step 4. 관중석 생성 중...')

    for (let row = 0; row < STAND_ROWS; row++) {
      const standY = wallTop + row        // 벽 위에서 시작
      const offset = half + 1 + row      // 벽에서 얼마나 떨어졌는지

      // 북쪽
      await sendCommand(rcon, `fill ${cx-half-row} ${standY} ${cz-offset} ${cx+half+row} ${standY} ${cz-offset} stone_brick_slab`)
      // 남쪽
      await sendCommand(rcon, `fill ${cx-half-row} ${standY} ${cz+offset} ${cx+half+row} ${standY} ${cz+offset} stone_brick_slab`)
      // 서쪽
      await sendCommand(rcon, `fill ${cx-offset} ${standY} ${cz-half-row} ${cx-offset} ${standY} ${cz+half+row} stone_brick_slab`)
      // 동쪽
      await sendCommand(rcon, `fill ${cx+offset} ${standY} ${cz-half-row} ${cx+offset} ${standY} ${cz+half+row} stone_brick_slab`)

      // 관중석 아래 채우기
      await sendCommand(rcon, `fill ${cx-half-row} ${wallTop} ${cz-offset} ${cx+half+row} ${standY-1} ${cz-offset} stone_bricks`)
      await sendCommand(rcon, `fill ${cx-half-row} ${wallTop} ${cz+offset} ${cx+half+row} ${standY-1} ${cz+offset} stone_bricks`)
      await sendCommand(rcon, `fill ${cx-offset} ${wallTop} ${cz-half-row} ${cx-offset} ${standY-1} ${cz+half+row} stone_bricks`)
      await sendCommand(rcon, `fill ${cx+offset} ${wallTop} ${cz-half-row} ${cx+offset} ${standY-1} ${cz+half+row} stone_bricks`)
      await delay(200)
    }

    // ─────────────────────────────────────
    // 5단계: 조명 설치
    // ─────────────────────────────────────
    console.log('Step 5. 조명 설치 중...')
    const torchY = wallTop + STAND_ROWS + 1
    const torchOffset = half + STAND_ROWS

    for (let i = -half; i <= half; i += 10) {
      await sendCommand(rcon, `setblock ${cx+i} ${torchY} ${cz-torchOffset} torch`)
      await sendCommand(rcon, `setblock ${cx+i} ${torchY} ${cz+torchOffset} torch`)
      await sendCommand(rcon, `setblock ${cx-torchOffset} ${torchY} ${cz+i} torch`)
      await sendCommand(rcon, `setblock ${cx+torchOffset} ${torchY} ${cz+i} torch`)
    }
    await delay(300)

    // ─────────────────────────────────────
    // 6단계: 스폰 포인트 설정
    // ─────────────────────────────────────
    console.log('Step 6. 스폰 포인트 설정 중...')
    await sendCommand(rcon, `/setworldspawn ${cx} ${cy+1} ${cz}`)
    await sendCommand(rcon, `/gamerule doMobSpawning false`)
    await sendCommand(rcon, `/gamerule doDaylightCycle false`)
    await sendCommand(rcon, `/time set day`)

    console.log('\n✅ 아레나 생성 완료!')
    console.log(`📍 중심 좌표: ${cx}, ${cy}, ${cz}`)
    console.log(`📐 전투 공간: ${FLOOR_SIZE}x${FLOOR_SIZE}`)
    console.log(`🏟️  관중석: ${STAND_ROWS}단 (Y: ${wallTop} ~ ${wallTop+STAND_ROWS-1})`)

  } catch (err) {
    console.error('❌ RCON 오류:', err.message)
  } finally {
    await rcon.end()
  }
}

module.exports = { buildArena, ARENA_X, ARENA_Y, ARENA_Z }
