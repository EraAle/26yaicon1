/effect give VLLMBot minecraft:resistance infinite 4 true
/effect give VLLMBot minecraft:regeneration infinite 4 true
/effect give VLLMBot minecraft:fire_resistance infinite 0 true
/weather clear
/gamerule doWeatherCycle false
/weather clear
/time set day
/gamerule doDaylightCycle false
/time set day
/gamerule doDaylightCycle false
/time set noon

op VLLMBot
gamerule doWeatherCycle false
weather clear
gamerule doDaylightCycle false
time set noon
effect give VLLMBot minecraft:resistance infinite 4 true
effect give VLLMBot minecraft:regeneration infinite 4 true
effect give VLLMBot minecraft:fire_resistance infinite 0 true

fill -20 65 -20 20 65 20 stone_bricks
fill -20 66 -20 20 71 -20 stone_bricks
fill -20 66 20 20 71 20 stone_bricks
fill -20 66 -20 -20 71 20 stone_bricks
fill 20 66 -20 20 71 20 stone_bricks
tp VLLMBot 0 66 0
gamerule doMobSpawning false
gamerule doDaylightCycle false
gamerule doWeatherCycle false
time set noon
weather clear

gamerule doMobSpawning false
gamerule doMobLoot false
gamerule doDaylightCycle false
gamerule doWeatherCycle false
time set noon
weather clear

서버 콘솔에서는 `/` 없이 입력하면 돼.

## 봇 바로 근처에 소환

```mcfunction
execute at VLLMBot run summon zombie ~ ~ ~3
```

스켈레톤:

```mcfunction
execute at VLLMBot run summon skeleton ~ ~ ~3
```

이건 **봇 기준이 아니라 월드 좌표축 기준으로 z+3**이라, 봇 시야 정면이 아닐 수도 있어.

---

## 봇이 보는 방향 앞쪽에 소환

이게 테스트용으로 더 좋음.

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^ ^ ^5 run summon zombie
```

스켈레톤:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^ ^ ^5 run summon skeleton
```

거리만 바꾸면 됨.

가까이:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^ ^ ^2.5 run summon zombie
```

너무 가까이:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^ ^ ^1.2 run summon zombie
```

멀리:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^ ^ ^7 run summon zombie
```

---

## 봇 시야 왼쪽/오른쪽에 소환

왼쪽:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^2 ^ ^4 run summon zombie
```

오른쪽:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^-2 ^ ^4 run summon zombie
```

스켈레톤 오른쪽:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^-2 ^ ^4 run summon skeleton
```

---

## 움직이지 않는 테스트용 몹

데이터셋처럼 고정시키려면:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^ ^ ^4 run summon zombie ~ ~ ~ {NoAI:1b,Silent:1b,PersistenceRequired:1b}
```

스켈레톤:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^ ^ ^4 run summon skeleton ~ ~ ~ {NoAI:1b,Silent:1b,PersistenceRequired:1b}
```

---

## 몹 정리

```mcfunction
kill @e[type=zombie]
kill @e[type=skeleton]
kill @e[type=item]
kill @e[type=experience_orb]
```

실시간 행동 테스트면 우선 이거 추천:

```mcfunction
execute as VLLMBot at VLLMBot anchored eyes positioned ^ ^ ^5 run summon zombie
```

봇 정면 5블록 앞에 zombie가 생겨서 `far/center → forward → attack` 흐름 테스트하기 좋음.
