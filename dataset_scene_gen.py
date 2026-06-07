import io
import os
import json
import time
import random
import requests

from PIL import Image
from playwright.sync_api import sync_playwright


SAVE_DIR = "arena_scene_dataset"

VIEWER_URL = "http://localhost:3007"
CONTROL_URL = "http://localhost:8082"

VIEWPORT_WIDTH = 320
VIEWPORT_HEIGHT = 180

SAMPLES_PER_MODE = 1000

WAIT_AFTER_CREATE = 0.25
REQUEST_TIMEOUT = 10

SCENE_MODES = [
    "no_entity",
    "single_center_attackable",
    "single_center_far",
    "single_left",
    "single_right",
    "too_close",
    "multi_nearest_center",
    "multi_nearest_left",
    "multi_nearest_right",
    "mixed_zombie_skeleton",
]


def ensure_dir(path):
    os.makedirs(path, exist_ok=True)


def get_next_index():
    if not os.path.exists(SAVE_DIR):
        return 0

    max_idx = -1

    for name in os.listdir(SAVE_DIR):
        if not name.endswith(".png"):
            continue

        stem = os.path.splitext(name)[0]
        if not stem.isdigit():
            continue

        json_path = os.path.join(SAVE_DIR, stem + ".json")

        if os.path.exists(json_path):
            max_idx = max(max_idx, int(stem))

    return max_idx + 1


def make_plan():
    plan = []

    for mode_id in range(len(SCENE_MODES)):
        for _ in range(SAMPLES_PER_MODE):
            plan.append(mode_id)

    random.shuffle(plan)
    return plan


def request_scene(mode_id):
    url = CONTROL_URL + "/scene/create"

    payload = {
        "mode_id": mode_id
    }

    r = requests.post(
        url,
        json=payload,
        timeout=REQUEST_TIMEOUT,
    )

    r.raise_for_status()
    data = r.json()

    if not data.get("ok"):
        raise RuntimeError(data.get("error", "scene/create failed"))

    return data["label"]


def save_sample(idx, image_bytes, label):
    stem = f"{idx:06d}"

    image_path = os.path.join(SAVE_DIR, stem + ".png")
    json_path = os.path.join(SAVE_DIR, stem + ".json")

    with open(image_path, "wb") as f:
        f.write(image_bytes)

    record = {
        "sample_idx": idx,
        "image_file": stem + ".png",

        "mode_id": label["mode_id"],
        "mode_name": label["mode_name"],

        "scene_labels": label["scene_labels"],
        "scene_text": label["scene_text"],

        "visible_entities": label["visible_entities"],
        "all_entities": label["all_entities"],

        "bot_pose": label["bot_pose"],
    }

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(record, f, indent=2, ensure_ascii=False)


def main():
    ensure_dir(SAVE_DIR)

    start_idx = get_next_index()
    print("save dir:", SAVE_DIR)
    print("start index:", start_idx)

    plan = make_plan()
    print("new samples:", len(plan))
    print("total after run:", start_idx + len(plan))

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--use-gl=egl",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
            ],
        )

        page = browser.new_page(
            viewport={
                "width": VIEWPORT_WIDTH,
                "height": VIEWPORT_HEIGHT,
            }
        )

        page.goto(VIEWER_URL)
        page.wait_for_selector("canvas")
        page.wait_for_timeout(2000)

        canvas = page.query_selector("canvas")

        ok_count = 0
        fail_count = 0

        for local_i, mode_id in enumerate(plan):
            idx = start_idx + local_i
            mode_name = SCENE_MODES[mode_id]

            try:
                label = request_scene(mode_id)

                time.sleep(WAIT_AFTER_CREATE)

                image_bytes = canvas.screenshot()

                save_sample(idx, image_bytes, label)

                ok_count += 1

                if ok_count % 20 == 0:
                    scene_labels = label["scene_labels"]
                    print(
                        f"{idx:06d} "
                        f"ok={ok_count} fail={fail_count} "
                        f"mode={mode_name} "
                        f"nearest={scene_labels['nearest_type']} "
                        f"{scene_labels['nearest_distance_bin']} "
                        f"{scene_labels['nearest_horizontal_bin']} "
                        f"visible={scene_labels['visible_entity_count']}"
                    )

            except Exception as e:
                fail_count += 1
                print(f"{idx:06d} failed mode={mode_name}: {e}")
                time.sleep(0.5)

        browser.close()

    print("done")
    print("ok:", ok_count)
    print("failed:", fail_count)


if __name__ == "__main__":
    main()