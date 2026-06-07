import json
import os
import random
import time

import requests
from playwright.sync_api import sync_playwright


# ===== 사용자 설정 =====

SAVE_DIR = "arena_dataset"

VIEWER_URL = "http://localhost:3007"
CONTROL_URL = "http://localhost:8082"

VIEWPORT_SIZE = 240

SAMPLES_PER_CLASS = 500
WAIT_AFTER_CREATE = 0.25

CLASS_NAMES = [
    "no_entity",

    "far_zombie",
    "near_left_zombie",
    "near_right_zombie",
    "near_center_zombie",

    "far_skeleton",
    "near_left_skeleton",
    "near_right_skeleton",
    "near_center_skeleton",
]


# ===== 저장 함수 =====

def save_sample(idx, image_bytes, label):
    image_path = os.path.join(SAVE_DIR, f"{idx:06d}.png")
    label_path = os.path.join(SAVE_DIR, f"{idx:06d}.json")

    with open(image_path, "wb") as f:
        f.write(image_bytes)

    with open(label_path, "w", encoding="utf-8") as f:
        json.dump(label, f, indent=2)

def get_next_index():
    if not os.path.exists(SAVE_DIR):
        return 0

    max_idx = -1

    for name in os.listdir(SAVE_DIR):
        if not name.endswith(".png"):
            continue

        stem = os.path.splitext(name)[0]

        if stem.isdigit():
            max_idx = max(max_idx, int(stem))

    return max_idx + 1

# ===== API 호출 =====

def create_sample(class_id):
    resp = requests.post(
        f"{CONTROL_URL}/sample/create",
        json={"class_id": class_id},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


# ===== 메인 =====

def main():
    os.makedirs(SAVE_DIR, exist_ok=True)

    class_ids = []
    for class_id in range(len(CLASS_NAMES)):
        class_ids += [class_id] * SAMPLES_PER_CLASS

    random.shuffle(class_ids)

    with sync_playwright() as p:
        # 브라우저 실행
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--use-gl=egl",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
            ],
        )

        # 화면 크기 설정
        page = browser.new_page(
            viewport={
                "width": VIEWPORT_SIZE,
                "height": VIEWPORT_SIZE,
            }
        )

        # Viewer 접속
        page.goto(VIEWER_URL)
        page.wait_for_selector("canvas")
        page.wait_for_timeout(2000)

        canvas = page.query_selector("canvas")
        print("viewer ready")
        start_idx = get_next_index()
        print("start index:", start_idx)

        for local_idx, class_id in enumerate(class_ids):
            idx = start_idx + local_idx
            # 몹 배치
            data = create_sample(class_id)

            if not data.get("success"):
                print("failed:", data.get("error"))
                time.sleep(0.5)
                continue

            time.sleep(WAIT_AFTER_CREATE)

            # 이미지 캡처
            image_bytes = canvas.screenshot()

            # 라벨 구성
            label = {
                "sample_idx": idx,
                "class_id": class_id,
                "class_name": CLASS_NAMES[class_id],
                "label": data["label"],
            }

            save_sample(idx, image_bytes, label)

            print(f"{idx:06d}", CLASS_NAMES[class_id])

        browser.close()

    print("done")


if __name__ == "__main__":
    main()