const mineflayer = require('mineflayer')
const express = require('express')
const { mineflayer: mineflayerViewer } = require('prismarine-viewer')

const VIEWER_PORT = 3007
const CONTROL_PORT = 8082

const bot = mineflayer.createBot({
  host: 'localhost',
  port: 25565,
  username: 'VLLMBot',
  version: '1.20.1',
  physicsEnabled: true
})

const app = express()
app.use(express.json())

const CLASS_NAMES = [
  'no_entity',

  'far_zombie',
  'near_left_zombie',
  'near_right_zombie',
  'near_center_zombie',

  'far_skeleton',
  'near_left_skeleton',
  'near_right_skeleton',
  'near_center_skeleton'
]

let latestVision = {
  class_id: 0,
  class_name: 'no_entity',
  prob: 0.0,
  time: 0
}

let lastAttackTime = 0
let lastLookTime = 0
let busyLooking = false

const ATTACK_INTERVAL_MS = 650
const VISION_TIMEOUT_MS = 1200
const CONTROL_TICK_MS = 100

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function stopMovement() {
  bot.setControlState('forward', false)
  bot.setControlState('back', false)
  bot.setControlState('left', false)
  bot.setControlState('right', false)
  bot.setControlState('jump', false)
  bot.setControlState('sprint', false)
}

function isTargetEntity(entity) {
  if (!entity) return false
  if (!entity.position) return false
  if (entity.isValid === false) return false

  return entity.name === 'zombie' || entity.name === 'skeleton'
}

function getNearestTarget(maxDist) {
  if (!bot.entity || !bot.entity.position) return null

  let best = null
  let bestDist = Infinity

  for (const id in bot.entities) {
    const entity = bot.entities[id]
    if (!isTargetEntity(entity)) continue

    const dist = bot.entity.position.distanceTo(entity.position)

    if (dist < bestDist && dist <= maxDist) {
      best = entity
      bestDist = dist
    }
  }

  return best
}

async function lookAtTarget(entity) {
  if (!entity || !entity.position) return
  if (busyLooking) return

  busyLooking = true

  try {
    const h = entity.height || 1.6
    await bot.lookAt(entity.position.offset(0, h * 0.6, 0), true)
  } catch (e) {
  }

  busyLooking = false
}

async function explore() {
  stopMovement()

  const now = Date.now()
  if (now - lastLookTime < 250) return

  lastLookTime = now

  const yaw = bot.entity.yaw + 20 * Math.PI / 180
  const pitch = Math.sin(now / 800) * 8 * Math.PI / 180

  try {
    await bot.look(yaw, pitch, true)
  } catch (e) {
  }
}

async function equipSword() {
  let sword = bot.inventory.items().find(item => {
    return item.name === 'iron_sword' ||
           item.name === 'diamond_sword' ||
           item.name === 'netherite_sword' ||
           item.name === 'stone_sword' ||
           item.name === 'wooden_sword'
  })

  if (!sword) {
    console.log('no sword found, giving iron sword')

    bot.chat(`/give ${bot.username} minecraft:iron_sword 1`)
    await sleep(500)

    sword = bot.inventory.items().find(item => item.name === 'iron_sword')
  }

  if (!sword) {
    console.log('failed to get sword')
    return
  }

  try {
    await bot.equip(sword, 'hand')
    console.log('equipped sword:', sword.name)
  } catch (e) {
    console.log('equip failed:', e.message)
  }
}

async function moveForwardToEntity() {
  const target = getNearestTarget(10)

  if (target) {
    await lookAtTarget(target)
  }

  bot.setControlState('forward', true)
  bot.setControlState('sprint', true)
}

async function attackEntity() {
  stopMovement()

  const target = getNearestTarget(3.4)

  if (!target) {
    return
  }

  await lookAtTarget(target)

  const now = Date.now()
  if (now - lastAttackTime < ATTACK_INTERVAL_MS) {
    return
  }

  lastAttackTime = now

  try {
    bot.attack(target)
    console.log('attack:', target.name)
  } catch (e) {
    console.log('attack failed:', e.message)
  }
}

async function controlTick() {
  if (!bot.entity) return

  const now = Date.now()

  if (now - latestVision.time > VISION_TIMEOUT_MS) {
    stopMovement()
    return
  }

  const cid = latestVision.class_id

  if (cid === 0) {
    await explore()
    return
  }

  if (cid === 1 || cid === 5) {
    await moveForwardToEntity()
    return
  }

  if (
    cid === 2 || cid === 3 || cid === 4 ||
    cid === 6 || cid === 7 || cid === 8
  ) {
    await attackEntity()
    return
  }

  stopMovement()
}

app.post('/vision', (req, res) => {
  const classId = Number(req.body.class_id)
  const prob = Number(req.body.prob || 0)

  if (!Number.isInteger(classId) || classId < 0 || classId >= CLASS_NAMES.length) {
    res.status(400).json({ ok: false, error: 'invalid class_id' })
    return
  }

  latestVision = {
    class_id: classId,
    class_name: CLASS_NAMES[classId],
    prob,
    time: Date.now()
  }

  res.json({
    ok: true,
    received: latestVision
  })
})

app.get('/status', (req, res) => {
  res.json({
    ok: true,
    latestVision,
    bot: bot.entity ? {
      position: bot.entity.position,
      yaw: bot.entity.yaw,
      pitch: bot.entity.pitch
    } : null
  })
})

bot.once('spawn', async () => {
  console.log('Bot spawned!')

  mineflayerViewer(bot, {
    port: VIEWER_PORT,
    firstPerson: true,
    viewDistance: 6
  })

  console.log(`Viewer running at http://localhost:${VIEWER_PORT}`)

  await sleep(1000)
  await equipSword()

  setInterval(() => {
    controlTick().catch(() => {})
  }, CONTROL_TICK_MS)
})

bot.on('kicked', reason => {
  console.log('kicked:', reason)
})

bot.on('error', err => {
  console.log('bot error:', err)
})

app.listen(CONTROL_PORT, () => {
  console.log(`Control server running at http://localhost:${CONTROL_PORT}`)
})