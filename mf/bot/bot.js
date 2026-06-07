const mineflayer = require('mineflayer')
const express = require('express')
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')

const VIEWER_PORT = 3007
const CONTROL_PORT = 8082

const BOT_Y = 66

const BOT_X_MIN = -10
const BOT_X_MAX = 10
const BOT_Z_MIN = -10
const BOT_Z_MAX = 10

let currentPose = {
  x: 0,
  y: BOT_Y,
  z: 0,
  yawDeg: 0,
  pitchDeg: 0
}

const BOT_PITCH_MIN = -10
const BOT_PITCH_MAX = 10

const DATASET_TAG = 'vla_dataset'
const COMMAND_DELAY_MS = 250

const CLASS_SPECS = [
  { id: 0, name: 'no_entity', mob: null },

  { id: 1, name: 'far_zombie', mob: 'zombie',
    distMin: 5.0, distMax: 8.0, angleMin: -20, angleMax: 20 },

  { id: 2, name: 'near_left_zombie', mob: 'zombie',
    distMin: 2.2, distMax: 3.0, angleMin: 12, angleMax: 35 },

  { id: 3, name: 'near_right_zombie', mob: 'zombie',
    distMin: 2.2, distMax: 3.0, angleMin: -35, angleMax: -12 },

  { id: 4, name: 'near_center_zombie', mob: 'zombie',
    distMin: 2.2, distMax: 3.0, angleMin: -8, angleMax: 8 },

  { id: 5, name: 'far_skeleton', mob: 'skeleton',
    distMin: 5.0, distMax: 8.0, angleMin: -20, angleMax: 20 },

  { id: 6, name: 'near_left_skeleton', mob: 'skeleton',
    distMin: 2.2, distMax: 3.0, angleMin: 12, angleMax: 35 },

  { id: 7, name: 'near_right_skeleton', mob: 'skeleton',
    distMin: 2.2, distMax: 3.0, angleMin: -35, angleMax: -12 },

  { id: 8, name: 'near_center_skeleton', mob: 'skeleton',
    distMin: 2.2, distMax: 3.0, angleMin: -8, angleMax: 8 }
]

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'VLLMBot',
  version: '1.20.1',
  physicsEnabled: true
})

function randRange(a, b) {
  return a + Math.random() * (b - a)
}

function randInt(a, b) {
  return Math.floor(randRange(a, b + 1))
}

function degToRad(deg) {
  return deg * Math.PI / 180
}

function radToDeg(rad) {
  return rad * 180 / Math.PI
}

function makeRandomBotPose() {
  const yawDeg = randRange(-180, 180)
  const pitchDeg = randRange(BOT_PITCH_MIN, BOT_PITCH_MAX)

  return {
    x: randRange(BOT_X_MIN, BOT_X_MAX),
    y: BOT_Y,
    z: randRange(BOT_Z_MIN, BOT_Z_MAX),
    yawDeg,
    pitchDeg,
    yawRad: degToRad(yawDeg),
    pitchRad: degToRad(pitchDeg)
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randRange(a, b) {
  return a + Math.random() * (b - a)
}

function finiteVec(v) {
  return v &&
    Number.isFinite(v.x) &&
    Number.isFinite(v.y) &&
    Number.isFinite(v.z)
}

function sendCommand(cmd) {
  bot.chat('/' + cmd)
  return sleep(COMMAND_DELAY_MS)
}

function getSpawnPosFromYaw(basePos, yawRad, distance, angleDeg) {
  const angle = yawRad + degToRad(angleDeg)

  const x = basePos.x - Math.sin(angle) * distance
  const z = basePos.z - Math.cos(angle) * distance

  return {
    x,
    y: BOT_Y,
    z
  }
}

function getMobNbt() {
  return [
    `Tags:["${DATASET_TAG}"]`,
    'NoAI:1b',
    'Silent:1b',
    'PersistenceRequired:1b',
    'ActiveEffects:[{Id:12b,Amplifier:0b,Duration:1000000,ShowParticles:0b}]'
  ].join(',')
}

async function resetScene() {
  await sendCommand('gamerule doMobLoot false')
  await sendCommand(`kill @e[tag=${DATASET_TAG}]`)
  await sendCommand('kill @e[type=item]')
  await sendCommand('kill @e[type=experience_orb]')
  await sleep(150)
}

async function createSample(classId) {
  const spec = CLASS_SPECS[classId]
  if (!spec) {
    throw new Error(`invalid class_id: ${classId}`)
  }

  await resetScene()

  // 랜덤 위치/시야 생성
  const pose = makeRandomBotPose()

  // 위치만 teleport
  await sendCommand(
    `tp ${bot.username} ` +
    `${pose.x.toFixed(2)} ${pose.y.toFixed(2)} ${pose.z.toFixed(2)}`
  )

  await sleep(150)

  // Mineflayer 기준으로 실제 고개 돌리기
  await bot.look(pose.yawRad, pose.pitchRad, true).catch(() => {})

  await sleep(150)

  // 실제 bot 상태 읽기
  const botPos = bot.entity.position.clone()
  const actualYaw = bot.entity.yaw
  const actualPitch = bot.entity.pitch

  currentPose = {
    x: botPos.x,
    y: botPos.y,
    z: botPos.z,
    yawRad: actualYaw,
    pitchRad: actualPitch,
    yawDeg: radToDeg(actualYaw),
    pitchDeg: radToDeg(actualPitch)
  }

  let spawn = null
  let distance = null
  let angleDeg = null

  if (spec.mob) {
    distance = randRange(spec.distMin, spec.distMax)
    angleDeg = randRange(spec.angleMin, spec.angleMax)

    // 실제 bot.entity.yaw 기준으로 mob 소환
    spawn = getSpawnPosFromYaw(botPos, actualYaw, distance, angleDeg)

    await sendCommand(
      `summon ${spec.mob} ` +
      `${spawn.x.toFixed(2)} ${spawn.y.toFixed(2)} ${spawn.z.toFixed(2)} ` +
      `{${getMobNbt()}}`
    )
  }

  await sleep(300)

  return {
    class_id: spec.id,
    class_name: spec.name,
    mob: spec.mob,
    distance,
    angle_deg: angleDeg,
    spawn_pos: spawn,
    bot_pose: currentPose
  }
}

bot.once('spawn', async () => {
  console.log('Bot spawned!')

  mineflayerViewer(bot, {
    port: VIEWER_PORT,
    firstPerson: true,
    viewDistance: 6
  })

  console.log(`Viewer running at http://localhost:${VIEWER_PORT}`)
  console.log(`Control server running at http://localhost:${CONTROL_PORT}`)
})

bot.on('kicked', reason => {
  console.log('Kicked:', reason)
})

bot.on('error', err => {
  console.log('Error:', err)
})

const app = express()
app.use(express.json())

app.post('/sample/create', async (req, res) => {
  try {
    if (!bot.entity || !finiteVec(bot.entity.position)) {
      res.json({
        success: false,
        error: 'bot not ready'
      })
      return
    }

    const classId = req.body.class_id
    const label = await createSample(classId)

    res.json({
      success: true,
      label
    })
  } catch (err) {
    res.json({
      success: false,
      error: String(err.message || err)
    })
  }
})

app.post('/cleanup', async (req, res) => {
  try {
    await resetScene()
    res.json({ success: true })
  } catch (err) {
    res.json({
      success: false,
      error: String(err.message || err)
    })
  }
})

app.get('/classes', (req, res) => {
  res.json({
    success: true,
    classes: CLASS_SPECS
  })
})

app.listen(CONTROL_PORT)