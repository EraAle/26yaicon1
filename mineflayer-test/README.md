# Minecraft Combat Bot 테스트벤치

조원들이 각자 만든 전투봇을 공정하게 테스트할 수 있는 환경입니다.

---

## 폴더 구조

```
mineflayer-test/
├── run.js              ← 통합 실행 (레벨 선택 → 몬스터 소환 → 봇 실행)
├── setup/
│   └── levels.js       ← 레벨별 몬스터 소환 (RCON)
├── bots/
│   └── baseline.js     ← 기초 전투봇 (성능 비교 기준선)
├── bot.js              ← 기존 테스트 파일 (무시해도 됨)
└── README.md
```

---

## 레벨 구성

| 레벨 | 구성 
|------|------
| 1 | 좀비 2마리 
| 2 | 좀비 4마리 
| 3 | 좀비 3 + 스켈레톤 1 
| 4 | 좀비 4 + 스켈레톤 2 
| 5 | 좀비 5 + 스켈레톤 2 + 거미 1 

---

## 사전 준비

### 1. Docker Minecraft 서버 실행
```bash
docker start mc-server
docker logs -f mc-server
```

### 2. 맵 올리기 (처음 한 번만)
팀에서 공유한 맵 파일을 아래 방법으로 Docker 서버에 올립니다.
```bash
# 기존 world 백업
docker exec mc-server mv /data/world /data/world_backup

# 다운받은 맵 폴더 복사 (압축 해제 후 폴더명 확인)
docker cp ./맵폴더이름 mc-server:/data/world

# 서버 재시작
docker restart mc-server
```

### 3. Docker 서버 RCON 설정 확인
`docker-compose.yml`에 아래 설정이 있어야 합니다:
```yaml
environment:
  - RCON_PASSWORD=minecraft
  - ENABLE_RCON=true
```

### 4. 몬스터 소환 좌표 수정
`setup/levels.js` 파일에서 아레나 맵의 실제 좌표로 수정하세요.
Minecraft에서 F3 키를 눌러 현재 좌표 확인 후 봇 스폰 위치 주변으로 설정합니다.

### 5. 패키지 설치
```bash
npm install
```

---

## 실행 방법

### BaselineBot으로 테스트
```bash
# 레벨 1 테스트
node run.js --level 1

# 레벨 3 테스트
node run.js --level 3
```

### 모델 테스트 방법

bots 폴더에 본인의 모델 코드를 넣는다.

`run.js` 하단의 `createBaselineBot()` 부분을 본인 봇으로 교체하세요:
```js
// run.js 수정 예시
const { createMyBot } = require('./bots/my_bot')  // 본인 봇 import
// ...
createMyBot()  // createBaselineBot() 대신 사용
```

---

## 결과 측정 항목

봇 실행 시 아래 항목이 콘솔에 자동 출력됩니다:

| 항목 | 설명 |
|------|------|
| 킬 카운트 | 처치한 몬스터 수 |
| 생존 시간 | 전투 시작 ~ 종료까지 초 단위 |
| 피격 횟수 | 몬스터에게 맞은 횟수 |
| 사망 여부 | 봇이 죽었는지 여부 |

---

## 의존성 패키지

```json
"dependencies": {
  "mineflayer": "^4.37.1",
  "mineflayer-pvp": "^1.3.2",
  "mineflayer-pathfinder": "^2.4.5",
  "rcon-client": "^4.2.4"
}
```

---

## 주의사항

- Minecraft 서버 버전: **1.20.1** (다른 버전은 호환성 문제 가능)
- 봇 스폰 좌표와 몬스터 소환 좌표는 맵에 맞게 **직접 수정** 필요
- 테스트 전 매번 `node run.js --level N` 실행 시 기존 몬스터 자동 정리됨
