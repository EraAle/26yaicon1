// bots/baseline.js
// 기초 전투봇 (Baseline)
// 역할: 가장 가까운 적을 탐색 → 추적 → 공격
// 조원들 봇 성능 비교의 기준선(baseline)으로 사용

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { plugin: pvp } = require('mineflayer-pvp')

// ─────────────────────────────────────────
// 전투 대상 몬스터 목록
// ─────────────────────────────────────────
const HOSTILE_MOBS = ['zombie', 'skeleton', 'spider', 'creeper', 'witch']

// ─────────────────────────────────────────
// 봇 생성
// ─────────────────────────────────────────
function createBaselineBot(options = {}) {
  const bot = mineflayer.createBot({
    host: options.host || 'localhost',
    port: options.port || 25565,
    username: options.username || 'BaselineBot',
  })

  // 플러그인 로드
  bot.loadPlugin(pathfinder)
  bot.loadPlugin(pvp)

  // ─────────────────────────────────────────
  // 전투 통계 (결과 측정용)
  // ─────────────────────────────────────────
  const stats = {
    killCount: 0,
    startTime: null,
    survivalTime: 0,
    damageTaken: 0,
    isDead: false,
  }

  // ─────────────────────────────────────────
  // spawn 이벤트: 봇이 서버에 접속 완료
  // ─────────────────────────────────────────
  bot.once('spawn', () => {
    console.log('🤖 BaselineBot 접속 완료!')
    stats.startTime = Date.now()

    // pathfinder 이동 설정
    const movements = new Movements(bot)
    movements.allowSprinting = true
    movements.allowParkour = false    // 전투 중 파쿠르 방지
    bot.pathfinder.setMovements(movements)

    bot.chat('BaselineBot 준비 완료! 전투 시작합니다.')

    // 전투 루프 시작 (0.5초마다 주변 적 스캔)
    startCombatLoop()
  })

  // ─────────────────────────────────────────
  // 전투 루프: 가장 가까운 적 찾아서 공격
  // ─────────────────────────────────────────
  function startCombatLoop() {
    bot.on('physicsTick', () => {
      if (stats.isDead) return

      // 이미 공격 중인 타겟이 있으면 유지
      if (bot.pvp.target) return

      const target = findNearestHostile()
      if (target) {
        console.log(`⚔️  타겟 발견: ${target.name} (거리: ${bot.entity.position.distanceTo(target.position).toFixed(1)}블록)`)
        bot.pvp.attack(target)
      }
    })
  }

  // ─────────────────────────────────────────
  // 가장 가까운 적 엔티티 탐색
  // ─────────────────────────────────────────
  function findNearestHostile() {
    let nearest = null
    let minDist = Infinity

    const entities = Object.values(bot.entities)
    for (const entity of entities) {
      if (!entity || !entity.name) continue
      if (!HOSTILE_MOBS.includes(entity.name.toLowerCase())) continue
      if (entity.metadata?.[2] === true) continue // 죽은 엔티티 제외

      const dist = bot.entity.position.distanceTo(entity.position)
      if (dist < minDist) {
        minDist = dist
        nearest = entity
      }
    }

    return nearest
  }

  // ─────────────────────────────────────────
  // 적 처치 이벤트
  // ─────────────────────────────────────────
  bot.on('entityDead', (entity) => {
    if (!entity || !entity.name) return
    if (!HOSTILE_MOBS.includes(entity.name.toLowerCase())) return

    stats.killCount++
    console.log(`💀 처치! ${entity.name} | 총 킬: ${stats.killCount}`)
    bot.chat(`Kill ${stats.killCount}! ${entity.name} 처치`)
  })

  // ─────────────────────────────────────────
  // 데미지 수신 이벤트
  // ─────────────────────────────────────────
  bot.on('entityHurt', (entity) => {
    if (entity !== bot.entity) return
    stats.damageTaken++
    const hp = bot.health?.toFixed(1) ?? '?'
    const hpBar = getHpBar(bot.health, 20)
    const warning = bot.health <= 6 ? '  ⚠️  위험!' : ''
    console.log(`💢 피격! ${hpBar} ${hp}/20 | 총 피격: ${stats.damageTaken}회${warning}`)
  })

  // 체력바 시각화
  function getHpBar(hp, maxHp) {
    const filled = Math.round((hp / maxHp) * 10)
    const empty = 10 - filled
    const color = hp > 12 ? '❤️' : hp > 6 ? '🧡' : '💔'
    return color + ' [' + '█'.repeat(Math.max(0,filled)) + '░'.repeat(Math.max(0,empty)) + ']'
  }

  // 체력 5초마다 출력
  setInterval(() => {
    if (stats.isDead || !stats.startTime) return
    const hp = bot.health?.toFixed(1) ?? '?'
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0)
    const hpBar = getHpBar(bot.health, 20)
    console.log(`${hpBar} HP: ${hp}/20 | 킬: ${stats.killCount} | 생존: ${elapsed}초`)
  }, 5000)

  // ─────────────────────────────────────────
  // 봇 사망 이벤트
  // ─────────────────────────────────────────
  bot.on('death', () => {
    stats.isDead = true
    stats.survivalTime = ((Date.now() - stats.startTime) / 1000).toFixed(1)
    bot.pvp.stop()

    console.log('\n💀 ===== BaselineBot 사망 =====')
    printStats()
  })

  // ─────────────────────────────────────────
  // 전투 완료 감지: 주변에 적이 없을 때
  // ─────────────────────────────────────────
  setInterval(() => {
    if (stats.isDead) return
    if (!stats.startTime) return

    const hostiles = Object.values(bot.entities).filter(e =>
      e && e.name && HOSTILE_MOBS.includes(e.name.toLowerCase())
    )

    if (hostiles.length === 0 && stats.killCount > 0) {
      stats.survivalTime = ((Date.now() - stats.startTime) / 1000).toFixed(1)
      console.log('\n🏆 ===== 전투 완료! 모든 적 처치 =====')
      bot.chat('전투 완료! 모든 적을 처치했습니다.')
      printStats()
    }
  }, 2000)

  // ─────────────────────────────────────────
  // 결과 출력
  // ─────────────────────────────────────────
  function printStats() {
    const elapsed = stats.startTime
      ? ((Date.now() - stats.startTime) / 1000).toFixed(1)
      : stats.survivalTime

    console.log('─────────────────────────────')
    console.log(`🤖 봇 이름:     BaselineBot`)
    console.log(`💀 킬 카운트:   ${stats.killCount}`)
    console.log(`⏱️  생존 시간:   ${elapsed}초`)
    console.log(`💢 피격 횟수:   ${stats.damageTaken}회`)
    console.log(`☠️  사망 여부:   ${stats.isDead ? 'YES' : 'NO'}`)
    console.log('─────────────────────────────\n')
  }

  // ─────────────────────────────────────────
  // 에러/연결 끊김 처리
  // ─────────────────────────────────────────
  bot.on('error', (err) => console.error('❌ 봇 오류:', err.message))
  bot.on('kicked', (reason) => console.log('👢 추방됨:', reason))
  bot.on('end', () => {
    if (!stats.isDead) {
      stats.survivalTime = stats.startTime
        ? ((Date.now() - stats.startTime) / 1000).toFixed(1)
        : 0
    }
    console.log('\n🔌 봇 연결 종료')
    printStats()
  })

  return bot
}

// 단독 실행 시 바로 봇 시작
if (require.main === module) {
  createBaselineBot()
}

module.exports = { createBaselineBot }