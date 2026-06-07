from playwright.sync_api import sync_playwright
import numpy as np
import cv2
import time
import os
import random
import json
import urllib.request

DATA_DIR = 'data'
MOVEMENT_LOG = os.path.join(DATA_DIR, 'movement_log.json')
FRAMES_ARCHIVE = os.path.join(DATA_DIR, 'frames.npz')

os.makedirs(DATA_DIR, exist_ok=True)

ACTIONS = ['forward', 'left', 'right', 'jump', 'stop']

ACTION_TO_ID = {
    'forward': 0,
    'left': 1,
    'right': 2,
    'jump': 3,
    'stop': 4
}

VIEWER_URL = 'http://localhost:3007'
CONTROL_URL = 'http://localhost:8082/action'

RENDER_WIDTH = 240
RENDER_HEIGHT = 240

DURATION_MS = 200

def screenshot_to_frame(screenshot_bytes):
    image = np.frombuffer(screenshot_bytes, dtype=np.uint8)
    frame = cv2.imdecode(image, cv2.IMREAD_COLOR)
    return frame

with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        args=[
            "--use-gl=egl",
            "--enable-webgl",
            "--ignore-gpu-blocklist"
        ]
    )

    page = browser.new_page(viewport={"width": RENDER_WIDTH, "height": RENDER_HEIGHT})

    print('Opening viewer at', VIEWER_URL)
    page.goto(VIEWER_URL)
    page.wait_for_selector('canvas')
    time.sleep(2)
    print('Viewer ready')

    step = 0
    frame_t_items = []
    frame_t1_items = []
    action_id_items = []
    duration_ms_items = []
    timestamp_items = []
    
    # 기존 archive 있으면 로드해서 계속 이어붙이기
    if os.path.exists(FRAMES_ARCHIVE):
        try:
            existing = np.load(FRAMES_ARCHIVE)
            frame_t_items = list(existing['frame_t'])
            frame_t1_items = list(existing['frame_t1'])
            action_id_items = list(existing['action_id'])
            duration_ms_items = list(existing['duration_ms'])
            timestamp_items = list(existing['timestamp'])
            step = len(frame_t_items)
            print(f'Loaded existing archive: {step} samples')
        except Exception as e:
            print(f'⚠️ Failed to load existing archive: {e}')
    
    try:
        while True:
            # 1) capture 현재 관측
            screenshot = page.screenshot()
            frame_t = screenshot_to_frame(screenshot)
            if frame_t is None:
                print('⚠️ frame_t is None, skipping')
                time.sleep(0.2)
                continue

            # 강제 리사이즈
            try:
                frame_t = cv2.resize(frame_t, (RENDER_WIDTH, RENDER_HEIGHT), interpolation=cv2.INTER_AREA)
            except Exception:
                pass

            # 2) 샘플 액션 선택 (랜덤)
            action = random.choice(ACTIONS)
            action_id = ACTION_TO_ID.get(action, -1)
            timestamp = time.time()

            # 3) 액션 전송 (HTTP POST)
            payload = json.dumps({"action": action, "duration": DURATION_MS}).encode('utf-8')
            req = urllib.request.Request(CONTROL_URL, data=payload, headers={"Content-Type": "application/json"})
            try:
                urllib.request.urlopen(req, timeout=1)
            except Exception as e:
                print('⚠️ send action failed:', e)

            # 4) 환경이 반응할 시간 대기
            time.sleep(0.4)

            # 5) 다음 관측 캡처
            screenshot2 = page.screenshot()
            frame_t1 = screenshot_to_frame(screenshot2)
            if frame_t1 is None:
                print('⚠️ frame_t1 is None, skipping')
                time.sleep(0.2)
                continue

            try:
                frame_t1 = cv2.resize(frame_t1, (RENDER_WIDTH, RENDER_HEIGHT), interpolation=cv2.INTER_AREA)
            except Exception:
                pass

            # 6) 버퍼에 append
            frame_t_items.append(frame_t)
            frame_t1_items.append(frame_t1)
            action_id_items.append(np.int32(action_id))
            duration_ms_items.append(np.int32(DURATION_MS))
            timestamp_items.append(np.float64(timestamp))
            
            # movement_log.json에 JSON 라인 append
            log_entry = {
                'step': step,
                'action': action,
                'action_id': int(action_id),
                'timestamp': float(timestamp),
                'duration_ms': int(DURATION_MS)
            }
            with open(MOVEMENT_LOG, 'a') as f:
                f.write(json.dumps(log_entry) + '\n')

            print(f'Step {step}: action={action}(id={action_id})')

            step += 1
            time.sleep(0.1)
    except KeyboardInterrupt:
        print('\nInterrupted by user')
    finally:
        # 모든 버퍼를 frames.npz로 저장
        if frame_t_items:
            np.savez_compressed(
                FRAMES_ARCHIVE,
                frame_t=np.stack(frame_t_items, axis=0),
                frame_t1=np.stack(frame_t1_items, axis=0),
                action_id=np.asarray(action_id_items, dtype=np.int32),
                duration_ms=np.asarray(duration_ms_items, dtype=np.int32),
                timestamp=np.asarray(timestamp_items, dtype=np.float64)
            )
            print(f'\n✅ Saved frames.npz: {len(frame_t_items)} samples')
            print(f'   Location: {FRAMES_ARCHIVE}')
        browser.close()
