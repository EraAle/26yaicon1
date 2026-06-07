// run.js
// 통합 실행 스크립트
//
// 사용법:
//   node run.js --level 1          (몬스터 소환 + 봇 실행)
//   node run.js --build-arena      (아레나 먼저 생성)
//   node run.js --build-arena --level 1  (아레나 생성 + 몬스터 소환 + 봇 실행)

const { spawnLevel, LEVELS } = require('./setup/levels')
const { createBaselineBot } = require('./bots/jaeeun_bot')
const { buildArena } = require('./setup/arena')

// ─────────────────────────────────────────
// 커맨드라인 인자 파싱
// ─────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2)
  const levelIdx = args.indexOf('--level')
  const buildArenaFlag = args.includes('--build-arena')

  let level = null
  if (levelIdx !== -1 && args[levelIdx + 1]) {
    level = parseInt(args[levelIdx + 1])
    if (isNaN(level) || level < 1 || level > 5) {
      console.error('❌ 레벨은 1~5 사이 숫자여야 합니다.')
      printUsage()
      process.exit(1)
    }
  }

  if (!buildArenaFlag && level === null) {
    printUsage()
    process.exit(1)
  }

  return { level, buildArenaFlag }
}

function printUsage() {
  console.log('\n사용법:')
  console.log('  node run.js --build-arena              아레나 생성만')
  console.log('  node run.js --level <1~5>              몬스터 소환 + 봇 실행')
  console.log('  node run.js --build-arena --level 1   아레나 생성 + 몬스터 소환 + 봇 실행\n')
  console.log('레벨 목록:')
  for (const [num, info] of Object.entries(LEVELS)) {
    console.log(`  ${num}: ${info.description}`)
  }
  console.log()
}

// ─────────────────────────────────────────
// 메인 실행
// ─────────────────────────────────────────
async function main() {
  const { level, buildArenaFlag } = parseArgs()

  console.log('===========================================')
  console.log('  Minecraft Combat Bot 테스트벤치')
  console.log('===========================================\n')

  // 아레나 생성
  if (buildArenaFlag) {
    console.log('🏟️  Step 1. 아레나 생성 중...')
    await buildArena()
    console.log('\n⏳ 아레나 생성 완료! 3초 대기...')
    await new Promise(resolve => setTimeout(resolve, 3000))
  }

  // 레벨 실행
  if (level !== null) {
    console.log(`\n📋 몬스터 소환 중... (레벨 ${level})`)
    await spawnLevel(level)

    console.log('\n⏳ 3초 후 JaeeunBot 투입...')
    await new Promise(resolve => setTimeout(resolve, 3000))

    console.log('🤖 JaeeunBot 실행!\n')
    createBaselineBot()
  }
}

main().catch(err => {
  console.error('❌ 실행 오류:', err.message)
  process.exit(1)
})
