// bots/jaeeun_bot.js
// JaeeunBot: enhanced rule-based combat bot for mineflayer-test.
// - execution: mineflayer + mineflayer-pvp + mineflayer-pathfinder
// - decision: rule-based combat policy
// - RAG-lite: keyword retrieval from a small combat knowledge base
// - prompt-ready: builds a structured prompt for future LLM use
//
// This file runs without an LLM API. Current actions are selected by rules.
// RAG/prompt functions are included for explanation and later extension.

const mineflayer = require('mineflayer')
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder')
const { plugin: pvp } = require('mineflayer-pvp')
const { GoalNear } = goals

const HOSTILE_MOBS = ['zombie', 'skeleton', 'spider', 'creeper', 'witch', 'husk', 'drowned', 'stray']

const WEAPON_PRIORITY = [
  'netherite_sword',
  'diamond_sword',
  'iron_sword',
  'stone_sword',
  'wooden_sword',
  'netherite_axe',
  'diamond_axe',
  'iron_axe',
  'stone_axe',
  'wooden_axe'
]

const ARMOR_PRIORITY = {
  helmet: ['netherite_helmet', 'diamond_helmet', 'iron_helmet', 'chainmail_helmet', 'golden_helmet', 'leather_helmet'],
  chestplate: ['netherite_chestplate', 'diamond_chestplate', 'iron_chestplate', 'chainmail_chestplate', 'golden_chestplate', 'leather_chestplate'],
  leggings: ['netherite_leggings', 'diamond_leggings', 'iron_leggings', 'chainmail_leggings', 'golden_leggings', 'leather_leggings'],
  boots: ['netherite_boots', 'diamond_boots', 'iron_boots', 'chainmail_boots', 'golden_boots', 'leather_boots']
}

const FOOD_PRIORITY = [
  'cooked_beef',
  'cooked_porkchop',
  'cooked_mutton',
  'cooked_chicken',
  'bread',
  'apple',
  'carrot',
  'potato'
]

// Small knowledge base for RAG-lite.
// This is not a vector DB. It is keyword-based retrieval.
// It makes the decision policy explainable and prompt-ready.
const COMBAT_KNOWLEDGE = [
  {
    id: 'zombie',
    keywords: ['zombie', 'husk', 'drowned', 'melee'],
    text: 'Zombie-type mobs are melee enemies. Keep moving, avoid being surrounded, and attack the nearest one with a sword.'
  },
  {
    id: 'skeleton',
    keywords: ['skeleton', 'stray', 'ranged', 'arrow'],
    text: 'Skeleton-type mobs are ranged enemies. Equip a shield, close the distance, then attack. If multiple mobs are nearby, retreat first.'
  },
  {
    id: 'spider',
    keywords: ['spider', 'fast'],
    text: 'Spiders move quickly and jump. Treat them as close-range threats and attack when they are within melee distance.'
  },
  {
    id: 'creeper',
    keywords: ['creeper', 'explosion'],
    text: 'Creepers explode at close distance. Do not stay near a creeper. Retreat if a creeper is within 7 blocks.'
  },
  {
    id: 'surrounded',
    keywords: ['surrounded', 'many', 'multiple', 'nearby'],
    text: 'When three or more hostile mobs are within 6 blocks, stop attacking and retreat to create space.'
  },
  {
    id: 'low_health',
    keywords: ['low_health', 'critical', 'health'],
    text: 'When health is low, survival is more important than attacking. Retreat, then eat food or use a helpful potion if possible.'
  },
  {
    id: 'equipment',
    keywords: ['weapon', 'armor', 'shield', 'equipment'],
    text: 'Before fighting, equip the strongest available weapon, armor, and shield.'
  }
]

function createBaselineBot(options = {}) {
  const bot = mineflayer.createBot({
    host: options.host || 'localhost',
    port: options.port || 25565,
    username: options.username || 'JaeeunBot',
    version: options.version || '1.20.1'
  })

  bot.loadPlugin(pathfinder)
  bot.loadPlugin(pvp)

  const stats = {
    killCount: 0,
    startTime: null,
    survivalTime: 0,
    damageTaken: 0,
    isDead: false,
    lastDecision: 'none'
  }

  const state = {
    busy: false,
    lastRetreatAt: 0,
    lastEquipmentAt: 0,
    shieldRaised: false
  }

  const POLICY = {
    searchRadius: 35,
    dangerRadius: 6,
    surroundedCount: 3,
    lowHealth: 9,
    criticalHealth: 5,
    retreatDistance: 10,
    retreatCooldownMs: 1800,
    equipmentIntervalMs: 3000
  }

  bot.once('spawn', async () => {
    console.log('🤖 JaeeunBot 접속 완료!')
    stats.startTime = Date.now()

    const mcData = require('minecraft-data')(bot.version)
    const movements = new Movements(bot, mcData)
    movements.allowSprinting = true
    movements.allowParkour = false
    movements.canDig = false
    bot.pathfinder.setMovements(movements)

    bot.chat('JaeeunBot ready: rule-based combat + RAG-lite policy')

    await prepareEquipment(true)
    startCombatLoop()
  })

  function isHostile(entity) {
    if (!entity || !entity.name || !entity.position) return false
    if (!HOSTILE_MOBS.includes(entity.name.toLowerCase())) return false
    if (entity.metadata?.[2] === true) return false
    return true
  }

  function distTo(entity) {
    return bot.entity.position.distanceTo(entity.position)
  }

  function getHostiles(radius = POLICY.searchRadius) {
    return Object.values(bot.entities)
      .filter(isHostile)
      .map(entity => ({ entity, dist: distTo(entity) }))
      .filter(x => x.dist <= radius)
      .sort((a, b) => a.dist - b.dist)
  }

  function getNearestHostile(radius = POLICY.searchRadius) {
    const hostiles = getHostiles(radius)
    if (hostiles.length === 0) return null

    // Prioritize nearby skeletons because they deal ranged damage.
    const closeSkeleton = hostiles.find(h => ['skeleton', 'stray'].includes(h.entity.name.toLowerCase()) && h.dist <= 16)
    if (closeSkeleton) return closeSkeleton.entity

    return hostiles[0].entity
  }

  function findItemByNames(names) {
    const items = bot.inventory.items()
    for (const name of names) {
      const item = items.find(i => i.name === name)
      if (item) return item
    }
    return null
  }

  function itemText(item) {
    try {
      return JSON.stringify(item.nbt || {}).toLowerCase()
    } catch {
      return ''
    }
  }

  function findPotion(kind) {
    const items = bot.inventory.items().filter(i => i.name === 'potion' || i.name === 'splash_potion')
    for (const item of items) {
      const text = itemText(item)
      if (text.includes(kind)) return item
    }
    return null
  }

  async function safeEquip(item, destination) {
    if (!item) return false
    try {
      await bot.equip(item, destination)
      return true
    } catch (err) {
      console.log(`⚠️ 장착 실패(${destination}):`, err.message)
      return false
    }
  }

  async function equipBestWeapon() {
    const weapon = findItemByNames(WEAPON_PRIORITY)
    if (!weapon) return false
    if (bot.heldItem && bot.heldItem.name === weapon.name) return true

    const ok = await safeEquip(weapon, 'hand')
    if (ok) console.log('🗡️ 무기 장착:', weapon.name)
    return ok
  }

  async function equipArmor() {
    for (const [slot, names] of Object.entries(ARMOR_PRIORITY)) {
      const armor = findItemByNames(names)
      if (armor) await safeEquip(armor, slot)
    }
  }

  async function equipShield() {
    const shield = bot.inventory.items().find(i => i.name === 'shield')
    if (!shield) return false
    const ok = await safeEquip(shield, 'off-hand')
    if (ok) console.log('🛡️ 방패 장착')
    return ok
  }

  async function raiseShield() {
    if (state.shieldRaised) return
    try {
      bot.activateItem(true)
      state.shieldRaised = true
    } catch (_) {
      state.shieldRaised = false
    }
  }

  async function lowerShield() {
    if (!state.shieldRaised) return
    try {
      bot.deactivateItem()
    } catch (_) {}
    state.shieldRaised = false
  }

  async function prepareEquipment(force = false) {
    const now = Date.now()
    if (!force && now - state.lastEquipmentAt < POLICY.equipmentIntervalMs) return

    state.lastEquipmentAt = now
    await lowerShield()
    await equipArmor()
    await equipBestWeapon()
    await equipShield()
  }

  async function eatFoodIfNeeded() {
    // Minecraft only allows eating when food is not full.
    if (bot.food >= 20) return false
    if (bot.health > 13 && bot.food > 12) return false

    const food = findItemByNames(FOOD_PRIORITY)
    if (!food) return false

    try {
      bot.pvp.stop()
      bot.pathfinder.setGoal(null)
      await lowerShield()
      await bot.equip(food, 'hand')
      await bot.consume()
      console.log('🍖 음식 섭취:', food.name)
      await equipBestWeapon()
      return true
    } catch (err) {
      console.log('⚠️ 음식 섭취 스킵:', err.message)
      return false
    }
  }

  async function usePotionIfUseful() {
    // Optional potion support. It works only if potion NBT contains readable keywords.
    if (bot.health <= POLICY.lowHealth) {
      const healing = findPotion('healing') || findPotion('regeneration')
      if (healing) {
        try {
          bot.pvp.stop()
          bot.pathfinder.setGoal(null)
          await lowerShield()
          await bot.equip(healing, 'hand')
          await bot.consume()
          console.log('🧪 회복 물약 사용')
          await equipBestWeapon()
          return true
        } catch (err) {
          console.log('⚠️ 회복 물약 사용 실패:', err.message)
        }
      }
    }

    const strength = findPotion('strength')
    if (strength && stats.killCount === 0 && bot.health > 12) {
      try {
        await lowerShield()
        await bot.equip(strength, 'hand')
        await bot.consume()
        console.log('🧪 힘 물약 사용')
        await equipBestWeapon()
        return true
      } catch (err) {
        console.log('⚠️ 힘 물약 사용 실패:', err.message)
      }
    }

    return false
  }

  function getRetreatPoint(hostiles) {
    let dx = 0
    let dz = 0
    const my = bot.entity.position

    for (const h of hostiles) {
      dx += my.x - h.entity.position.x
      dz += my.z - h.entity.position.z
    }

    const len = Math.sqrt(dx * dx + dz * dz)
    if (len < 0.001) {
      dx = Math.random() - 0.5
      dz = Math.random() - 0.5
    } else {
      dx /= len
      dz /= len
    }

    return {
      x: my.x + dx * POLICY.retreatDistance,
      y: my.y,
      z: my.z + dz * POLICY.retreatDistance
    }
  }

  async function retreat(reason) {
    const now = Date.now()
    if (now - state.lastRetreatAt < POLICY.retreatCooldownMs) return false
    state.lastRetreatAt = now

    const hostiles = getHostiles(POLICY.searchRadius)
    if (hostiles.length === 0) return false

    const pos = getRetreatPoint(hostiles)
    bot.pvp.stop()
    await lowerShield()
    bot.setControlState('sprint', true)
    bot.pathfinder.setGoal(new GoalNear(pos.x, pos.y, pos.z, 2))

    stats.lastDecision = `retreat:${reason}`
    console.log(`🏃 후퇴: ${reason}`)
    return true
  }

  function retrieveCombatKnowledge(snapshot) {
    const keys = new Set()

    if (snapshot.targetName) keys.add(snapshot.targetName)
    if (snapshot.nearbyCount >= POLICY.surroundedCount) {
      keys.add('surrounded')
      keys.add('multiple')
    }
    if (snapshot.health <= POLICY.lowHealth) {
      keys.add('low_health')
      keys.add('health')
    }
    keys.add('weapon')
    keys.add('shield')

    const scored = COMBAT_KNOWLEDGE.map(k => {
      const score = k.keywords.reduce((acc, kw) => acc + (keys.has(kw) ? 1 : 0), 0)
      return { ...k, score }
    })
      .filter(k => k.score > 0)
      .sort((a, b) => b.score - a.score)

    return scored.slice(0, 3).map(k => k.text)
  }

  function buildDecisionPrompt(snapshot, retrievedKnowledge) {
    // Prompt engineering layer for future LLM decision use.
    return [
      'You are a Minecraft combat agent.',
      'Choose one action from: equip, attack, approach, shield_approach, retreat, eat, use_potion, avoid_creeper.',
      'Prioritize survival, then kill count.',
      '',
      'State:',
      JSON.stringify(snapshot),
      '',
      'Retrieved combat knowledge:',
      ...retrievedKnowledge.map((x, i) => `${i + 1}. ${x}`),
      '',
      'Return JSON: {"action": "...", "reason": "..."}'
    ].join('\n')
  }

  async function decideAndAct() {
    if (stats.isDead || !bot.entity) return
    if (state.busy) return
    state.busy = true

    try {
      const hostiles = getHostiles(POLICY.searchRadius)
      const nearby = getHostiles(POLICY.dangerRadius)
      const target = getNearestHostile(POLICY.searchRadius)

      const snapshot = {
        health: bot.health,
        food: bot.food,
        nearbyCount: nearby.length,
        hostileCount: hostiles.length,
        targetName: target ? target.name : null,
        targetDistance: target ? Number(distTo(target).toFixed(2)) : null,
        heldItem: bot.heldItem ? bot.heldItem.name : null,
        killCount: stats.killCount
      }

      const retrievedKnowledge = retrieveCombatKnowledge(snapshot)
      const prompt = buildDecisionPrompt(snapshot, retrievedKnowledge)

      console.log(`🧠 decision: target=${snapshot.targetName}, dist=${snapshot.targetDistance}, hp=${snapshot.health?.toFixed(1)}, nearby=${snapshot.nearbyCount}`)
      if (retrievedKnowledge.length > 0) console.log(`📚 retrieved: ${retrievedKnowledge[0]}`)

      await prepareEquipment()

      if (bot.health <= POLICY.criticalHealth) {
        await retreat('critical health')
        await eatFoodIfNeeded()
        state.busy = false
        return
      }

      if (nearby.length >= POLICY.surroundedCount) {
        await retreat('surrounded')
        state.busy = false
        return
      }

      const usedPotion = await usePotionIfUseful()
      if (usedPotion) {
        state.busy = false
        return
      }

      const ate = await eatFoodIfNeeded()
      if (ate) {
        state.busy = false
        return
      }

      if (!target) {
        bot.pvp.stop()
        bot.pathfinder.setGoal(null)
        await lowerShield()
        stats.lastDecision = 'idle'
        state.busy = false
        return
      }

      const name = target.name.toLowerCase()
      const dist = distTo(target)

      if (name === 'creeper') {
        if (dist < 8) {
          await retreat('creeper too close')
        } else {
          bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 5))
          stats.lastDecision = 'avoid_creeper'
        }
        state.busy = false
        return
      }

      if (name === 'skeleton' || name === 'stray') {
        await equipShield()
        if (dist > 4.5) {
          await raiseShield()
          bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 3))
          stats.lastDecision = 'shield_approach'
        } else {
          await lowerShield()
          await equipBestWeapon()
          bot.pvp.attack(target)
          stats.lastDecision = 'attack_skeleton'
        }
        state.busy = false
        return
      }

      await lowerShield()
      await equipBestWeapon()

      if (dist > 3.2) {
        bot.pathfinder.setGoal(new GoalNear(target.position.x, target.position.y, target.position.z, 2))
        stats.lastDecision = 'approach'
      } else {
        bot.pvp.attack(target)
        stats.lastDecision = `attack:${name}`
      }

      // Uncomment to inspect the full prompt.
      // console.log(prompt)

    } catch (err) {
      console.log('⚠️ decision loop error:', err.message)
    }

    state.busy = false
  }

  function startCombatLoop() {
    setInterval(decideAndAct, 500)
  }

  bot.on('entityDead', (entity) => {
    if (!entity || !entity.name) return
    if (!HOSTILE_MOBS.includes(entity.name.toLowerCase())) return

    stats.killCount++
    console.log(`💀 처치! ${entity.name} | 총 킬: ${stats.killCount}`)
    bot.chat(`Kill ${stats.killCount}: ${entity.name}`)
    bot.pvp.stop()
  })

  bot.on('entityHurt', (entity) => {
    if (entity !== bot.entity) return

    stats.damageTaken++
    const hp = bot.health?.toFixed(1) ?? '?'
    const hpBar = getHpBar(bot.health, 20)
    const warning = bot.health <= POLICY.lowHealth ? '  ⚠️ 위험' : ''
    console.log(`💢 피격! ${hpBar} ${hp}/20 | 총 피격: ${stats.damageTaken}회${warning}`)
  })

  function getHpBar(hp, maxHp) {
    const safeHp = typeof hp === 'number' ? hp : 0
    const filled = Math.round((safeHp / maxHp) * 10)
    const empty = 10 - filled
    const color = safeHp > 12 ? '❤️' : safeHp > 6 ? '🧡' : '💔'
    return color + ' [' + '█'.repeat(Math.max(0, filled)) + '░'.repeat(Math.max(0, empty)) + ']'
  }

  setInterval(() => {
    if (stats.isDead || !stats.startTime) return

    const hp = bot.health?.toFixed(1) ?? '?'
    const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0)
    const hpBar = getHpBar(bot.health, 20)
    console.log(`${hpBar} HP: ${hp}/20 | 킬: ${stats.killCount} | 생존: ${elapsed}초 | 행동: ${stats.lastDecision}`)
  }, 5000)

  bot.on('death', () => {
    stats.isDead = true
    stats.survivalTime = ((Date.now() - stats.startTime) / 1000).toFixed(1)
    try { bot.pvp.stop() } catch (_) {}

    console.log('\n💀 ===== JaeeunBot 사망 =====')
    printStats()
  })

  setInterval(() => {
    if (stats.isDead || !stats.startTime) return

    const hostiles = Object.values(bot.entities).filter(isHostile)
    if (hostiles.length === 0 && stats.killCount > 0) {
      stats.survivalTime = ((Date.now() - stats.startTime) / 1000).toFixed(1)
      console.log('\n🏆 ===== 전투 완료! 모든 적 처치 =====')
      bot.chat('전투 완료! 모든 적을 처치했습니다.')
      printStats()
    }
  }, 2000)

  function printStats() {
    const elapsed = stats.startTime
      ? ((Date.now() - stats.startTime) / 1000).toFixed(1)
      : stats.survivalTime

    console.log('─────────────────────────────')
    console.log(`🤖 봇 이름:     JaeeunBot`)
    console.log(`💀 킬 카운트:   ${stats.killCount}`)
    console.log(`⏱️  생존 시간:   ${elapsed}초`)
    console.log(`💢 피격 횟수:   ${stats.damageTaken}회`)
    console.log(`☠️  사망 여부:   ${stats.isDead ? 'YES' : 'NO'}`)
    console.log(`🧠 마지막 행동: ${stats.lastDecision}`)
    console.log('─────────────────────────────\n')
  }

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

if (require.main === module) {
  createBaselineBot()
}

module.exports = {
  createBaselineBot,
  createJaeeunBot: createBaselineBot
}
