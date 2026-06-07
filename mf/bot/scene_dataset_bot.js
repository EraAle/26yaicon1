const mineflayer = require('mineflayer')
const express = require('express')
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')

const VIEWER_PORT = 3007
const CONTROL_PORT = 8082

const BOT_Y = 66

const BOT_X_MIN = -6
const BOT_X_MAX = 6
const BOT_Z_MIN = -6
const BOT_Z_MAX = 6

const BOT_PITCH_MIN = -8
const BOT_PITCH_MAX = 8

const DATASET_TAG = 'vla_scene_dataset'
const COMMAND_DELAY_MS = 180

const VISIBLE_ANGLE_DEG = 50
const CENTER_ANGLE_DEG = 10
const SIDE_ANGLE_DEG = 28

const TOO_CLOSE_DIST = 1.4
const ATTACKABLE_DIST = 3.1
const NEAR_DIST = 5.0

const CLASS_TYPES = {
  none: 0,
  zombie: 1,
  skeleton: 2
}

const DISTANCE_BINS = {
  none: 0,
  too_close: 1,
  attackable: 2,
  near: 3,
  far: 4
}

const HORIZONTAL_BINS = {
  none: 0,
  center: 1,
  left: 2,
  right: 3,
  far_left: 4,
  far_right: 5
}

const VERTICAL_BINS = {
  middle: 0,
  up: 1,
  down: 2
}

const SCENE_MODES = [
  'no_entity',
  'single_center_attackable',
  'single_center_far',
  'single_left',
  'single_right',
  'too_close',
  'multi_nearest_center',
  'multi_nearest_left',
  'multi_nearest_right',
  'mixed_zombie_skeleton'
]

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'VLLMBot',
  version: '1.20.1',
  physicsEnabled: true
})

const app = express()
app.use(express.json())

let currentPose = {
  x: 0,
  y: BOT_Y,
  z: 0,
  yawRad: 0,
  pitchRad: 0,
  yawDeg: 0,
  pitchDeg: 0
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function randRange(a, b) {
  return a + Math.random() * (b - a)
}

function randInt(a, b) {
  return Math.floor(randRange(a, b + 1))
}

function choice(arr) {
  return arr[randInt(0, arr.length - 1)]
}

function degToRad(deg) {
  return deg * Math.PI / 180
}

function radToDeg(rad) {
  return rad * 180 / Math.PI
}

function normDeg(deg) {
  let d = deg
  while (d > 180) d -= 360
  while (d < -180) d += 360
  return d
}

async function sendCommand(cmd) {
  bot.chat('/' + cmd)
  await sleep(COMMAND_DELAY_MS)
}

async function resetScene() {
  await sendCommand('gamerule doMobLoot false')
  await sendCommand(`kill @e[tag=${DATASET_TAG}]`)
  await sendCommand('kill @e[type=item]')
  await sendCommand('kill @e[type=experience_orb]')
  await sleep(120)
}

function makeRandomBotPose() {
  const yawDeg = randRange(-180, 180)
  const pitchDeg = randRange(BOT_PITCH_MIN, BOT_PITCH_MAX)

  return {
    x: randRange(BOT_X_MIN, BOT_X_MAX),
    y: BOT_Y,
    z: randRange(BOT_Z_MIN, BOT_Z_MAX),
    yawRad: degToRad(yawDeg),
    pitchRad: degToRad(pitchDeg),
    yawDeg,
    pitchDeg
  }
}

async function applyBotPose(pose) {
  await sendCommand(
    `tp ${bot.username} ` +
    `${pose.x.toFixed(2)} ${pose.y.toFixed(2)} ${pose.z.toFixed(2)}`
  )

  await sleep(120)

  await bot.look(pose.yawRad, pose.pitchRad, true).catch(() => {})
  await sleep(120)

  const pos = bot.entity.position

  currentPose = {
    x: pos.x,
    y: pos.y,
    z: pos.z,
    yawRad: bot.entity.yaw,
    pitchRad: bot.entity.pitch,
    yawDeg: radToDeg(bot.entity.yaw),
    pitchDeg: radToDeg(bot.entity.pitch)
  }
}

function getSpawnPosFromRelative(distance, angleDeg) {
  const yawRad = currentPose.yawRad + degToRad(angleDeg)

  const x = currentPose.x - Math.sin(yawRad) * distance
  const z = currentPose.z - Math.cos(yawRad) * distance

  return {
    x,
    y: BOT_Y,
    z
  }
}

function getMobNbt() {
  return (
    `{` +
    `Tags:["${DATASET_TAG}"],` +
    `NoAI:1b,` +
    `Silent:1b,` +
    `PersistenceRequired:1b,` +
    `ActiveEffects:[{Id:12b,Amplifier:0b,Duration:1000000,ShowParticles:0b}]` +
    `}`
  )
}

async function spawnMob(type, distance, angleDeg) {
  const pos = getSpawnPosFromRelative(distance, angleDeg)

  await sendCommand(
    `summon ${type} ` +
    `${pos.x.toFixed(2)} ${pos.y.toFixed(2)} ${pos.z.toFixed(2)} ` +
    getMobNbt()
  )

  return makeEntityRecord(type, distance, angleDeg, pos)
}

function distanceBin(distance) {
  if (distance <= TOO_CLOSE_DIST) return 'too_close'
  if (distance <= ATTACKABLE_DIST) return 'attackable'
  if (distance <= NEAR_DIST) return 'near'
  return 'far'
}

function horizontalBin(angleDeg) {
  const a = normDeg(angleDeg)

  if (Math.abs(a) <= CENTER_ANGLE_DEG) return 'center'

  if (a > CENTER_ANGLE_DEG && a <= SIDE_ANGLE_DEG) return 'left'
  if (a < -CENTER_ANGLE_DEG && a >= -SIDE_ANGLE_DEG) return 'right'

  if (a > SIDE_ANGLE_DEG && a <= VISIBLE_ANGLE_DEG) return 'far_left'
  if (a < -SIDE_ANGLE_DEG && a >= -VISIBLE_ANGLE_DEG) return 'far_right'

  return 'none'
}

function verticalBin(distance) {
  const botEyeY = currentPose.y + 1.62
  const targetY = BOT_Y + 0.9
  const dy = targetY - botEyeY

  const targetPitch = Math.atan2(-dy, distance)
  const relPitchDeg = radToDeg(targetPitch - currentPose.pitchRad)

  if (relPitchDeg > 10) return 'down'
  if (relPitchDeg < -10) return 'up'
  return 'middle'
}

function makeEntityRecord(type, distance, angleDeg, pos) {
  const visible = Math.abs(normDeg(angleDeg)) <= VISIBLE_ANGLE_DEG

  const dBin = distanceBin(distance)
  const hBin = visible ? horizontalBin(angleDeg) : 'none'
  const vBin = visible ? verticalBin(distance) : 'middle'

  return {
    type,
    type_id: CLASS_TYPES[type],

    distance,
    distance_bin: dBin,
    distance_bin_id: DISTANCE_BINS[dBin],

    angle_deg: normDeg(angleDeg),
    horizontal_bin: hBin,
    horizontal_bin_id: HORIZONTAL_BINS[hBin],

    vertical_bin: vBin,
    vertical_bin_id: VERTICAL_BINS[vBin],

    visible,
    attackable: visible && distance > TOO_CLOSE_DIST && distance <= ATTACKABLE_DIST,
    too_close: visible && distance <= TOO_CLOSE_DIST,

    position: pos
  }
}

function summarizeScene(modeId, modeName, allEntities) {
  const visibleEntities = allEntities
    .filter(e => e.visible)
    .sort((a, b) => a.distance - b.distance)

  const nearest = visibleEntities.length > 0 ? visibleEntities[0] : null

  const visibleZombieCount = visibleEntities.filter(e => e.type === 'zombie').length
  const visibleSkeletonCount = visibleEntities.filter(e => e.type === 'skeleton').length

  let labels

  if (!nearest) {
    labels = {
      has_visible_entity: false,
      visible_entity_count: 0,
      visible_entity_count_bin: 0,
      visible_zombie_count: 0,
      visible_skeleton_count: 0,
      multiple_entities: false,

      nearest_type: 'none',
      nearest_type_id: CLASS_TYPES.none,

      nearest_distance_bin: 'none',
      nearest_distance_bin_id: DISTANCE_BINS.none,

      nearest_horizontal_bin: 'none',
      nearest_horizontal_bin_id: HORIZONTAL_BINS.none,

      nearest_vertical_bin: 'middle',
      nearest_vertical_bin_id: VERTICAL_BINS.middle,

      nearest_too_close: false,
      nearest_attackable: false
    }
  } else {
    labels = {
      has_visible_entity: true,
      visible_entity_count: visibleEntities.length,
      visible_entity_count_bin: Math.min(visibleEntities.length, 4),
      visible_zombie_count: visibleZombieCount,
      visible_skeleton_count: visibleSkeletonCount,
      multiple_entities: visibleEntities.length >= 2,

      nearest_type: nearest.type,
      nearest_type_id: nearest.type_id,

      nearest_distance_bin: nearest.distance_bin,
      nearest_distance_bin_id: nearest.distance_bin_id,

      nearest_horizontal_bin: nearest.horizontal_bin,
      nearest_horizontal_bin_id: nearest.horizontal_bin_id,

      nearest_vertical_bin: nearest.vertical_bin,
      nearest_vertical_bin_id: nearest.vertical_bin_id,

      nearest_too_close: nearest.too_close,
      nearest_attackable: nearest.attackable
    }
  }

  const sceneText = makeSceneText(labels, visibleEntities)

  return {
    mode_id: modeId,
    mode_name: modeName,

    scene_labels: labels,
    scene_text: sceneText,

    visible_entities: visibleEntities,
    all_entities: allEntities,

    bot_pose: currentPose
  }
}

function makeSceneText(labels, visibleEntities) {
  if (!labels.has_visible_entity) {
    return 'No hostile entity is visible.'
  }

  const n = labels.visible_entity_count
  const nearest = visibleEntities[0]

  let text = `${n} hostile entity`
  if (n !== 1) text += ' entities'
  text += ` visible. `

  text += `The nearest visible entity is a ${nearest.type} `
  text += `in the ${nearest.horizontal_bin} `
  text += `at ${nearest.distance_bin} distance. `

  if (labels.nearest_too_close) {
    text += 'It is too close. '
  } else if (labels.nearest_attackable) {
    text += 'It is within attack range. '
  }

  if (visibleEntities.length > 1) {
    const others = visibleEntities.slice(1, 4).map(e => {
      return `${e.type} ${e.distance_bin} ${e.horizontal_bin}`
    })

    text += `Other visible entities: ${others.join(', ')}.`
  }

  return text
}

async function addDistractors(allEntities, count, minDist) {
  for (let i = 0; i < count; i++) {
    const type = choice(['zombie', 'skeleton'])
    const dist = randRange(minDist, 8.5)

    let angle

    if (Math.random() < 0.75) {
      angle = choice([
        randRange(-65, -25),
        randRange(25, 65),
        randRange(-15, 15)
      ])
    } else {
      angle = choice([
        randRange(85, 160),
        randRange(-160, -85)
      ])
    }

    allEntities.push(await spawnMob(type, dist, angle))
  }
}

async function createScene(modeId) {
  const modeName = SCENE_MODES[modeId]
  if (modeName === undefined) {
    throw new Error(`invalid mode_id: ${modeId}`)
  }

  await resetScene()

  const pose = makeRandomBotPose()
  await applyBotPose(pose)

  const allEntities = []

  if (modeName === 'no_entity') {
    if (Math.random() < 0.4) {
      const hiddenCount = randInt(1, 3)

      for (let i = 0; i < hiddenCount; i++) {
        const type = choice(['zombie', 'skeleton'])
        const dist = randRange(3.0, 8.0)
        const angle = choice([
          randRange(85, 160),
          randRange(-160, -85)
        ])

        allEntities.push(await spawnMob(type, dist, angle))
      }
    }
  }

  else if (modeName === 'single_center_attackable') {
    const type = choice(['zombie', 'skeleton'])
    allEntities.push(await spawnMob(type, randRange(2.0, 3.0), randRange(-7, 7)))
  }

  else if (modeName === 'single_center_far') {
    const type = choice(['zombie', 'skeleton'])
    allEntities.push(await spawnMob(type, randRange(4.5, 7.5), randRange(-7, 7)))
  }

  else if (modeName === 'single_left') {
    const type = choice(['zombie', 'skeleton'])
    allEntities.push(await spawnMob(type, randRange(2.5, 7.0), randRange(14, 32)))
  }

  else if (modeName === 'single_right') {
    const type = choice(['zombie', 'skeleton'])
    allEntities.push(await spawnMob(type, randRange(2.5, 7.0), randRange(-32, -14)))
  }

  else if (modeName === 'too_close') {
    const type = choice(['zombie', 'skeleton'])
    allEntities.push(await spawnMob(type, randRange(0.85, 1.35), randRange(-35, 35)))
  }

  else if (modeName === 'multi_nearest_center') {
    const type = choice(['zombie', 'skeleton'])
    const targetDist = randRange(1.6, 3.6)

    allEntities.push(await spawnMob(type, targetDist, randRange(-8, 8)))
    await addDistractors(allEntities, randInt(2, 4), targetDist + 1.2)
  }

  else if (modeName === 'multi_nearest_left') {
    const type = choice(['zombie', 'skeleton'])
    const targetDist = randRange(1.6, 3.8)

    allEntities.push(await spawnMob(type, targetDist, randRange(18, 55)))
    await addDistractors(allEntities, randInt(2, 4), targetDist + 1.2)
  }

  else if (modeName === 'multi_nearest_right') {
    const type = choice(['zombie', 'skeleton'])
    const targetDist = randRange(1.6, 3.8)

    allEntities.push(await spawnMob(type, targetDist, randRange(-55, -18)))
    await addDistractors(allEntities, randInt(2, 4), targetDist + 1.2)
  }

  else if (modeName === 'mixed_zombie_skeleton') {
    const nearestType = choice(['zombie', 'skeleton'])
    const otherType = nearestType === 'zombie' ? 'skeleton' : 'zombie'

    const targetDist = randRange(1.6, 4.5)
    const targetAngle = choice([
      randRange(-8, 8),
      randRange(18, 55),
      randRange(-55, -18)
    ])

    allEntities.push(await spawnMob(nearestType, targetDist, targetAngle))

    const otherAngle = targetAngle > 0 ? randRange(-55, -15) : randRange(15, 55)
    allEntities.push(await spawnMob(otherType, randRange(targetDist + 1.0, 8.0), otherAngle))

    await addDistractors(allEntities, randInt(0, 2), targetDist + 1.5)
  }

  await sleep(250)

  return summarizeScene(modeId, modeName, allEntities)
}

app.get('/modes', (req, res) => {
  res.json({
    ok: true,
    modes: SCENE_MODES.map((name, id) => ({ id, name }))
  })
})

app.post('/scene/create', async (req, res) => {
  try {
    let modeId = req.body.mode_id

    if (modeId === undefined || modeId === null) {
      modeId = randInt(0, SCENE_MODES.length - 1)
    }

    modeId = Number(modeId)

    const label = await createScene(modeId)

    res.json({
      ok: true,
      label
    })
  } catch (e) {
    res.status(500).json({
      ok: false,
      error: e.message
    })
  }
})

app.post('/cleanup', async (req, res) => {
  try {
    await resetScene()
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

bot.once('spawn', () => {
  console.log('Bot spawned!')

  mineflayerViewer(bot, {
    port: VIEWER_PORT,
    firstPerson: true,
    viewDistance: 6
  })

  console.log(`Viewer running at http://localhost:${VIEWER_PORT}`)
})

bot.on('kicked', reason => {
  console.log('kicked:', reason)
})

bot.on('error', err => {
  console.log('bot error:', err)
})

app.listen(CONTROL_PORT, () => {
  console.log(`Scene dataset control server running at http://localhost:${CONTROL_PORT}`)
})