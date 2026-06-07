import argparse
import json
import os
import time

import requests
from playwright.sync_api import sync_playwright


DEFAULT_SAVE_DIR = "dataset"
DEFAULT_VIEWER_URL = "http://localhost:3007"
DEFAULT_CONTROL_URL = "http://localhost:8082/generate"


def save_sample(save_dir, idx, image_bytes, label):
    image_path = os.path.join(save_dir, f"{idx:06d}.png")
    label_path = os.path.join(save_dir, f"{idx:06d}.json")

    with open(image_path, "wb") as f:
        f.write(image_bytes)

    with open(label_path, "w", encoding="utf-8") as f:
        json.dump(label, f, indent=2)


def main():
    parser = argparse.ArgumentParser(description="Generate labeled Minecraft samples.")
    parser.add_argument("--save-dir", default=DEFAULT_SAVE_DIR)
    parser.add_argument("--viewer-url", default=DEFAULT_VIEWER_URL)
    parser.add_argument("--control-url", default=DEFAULT_CONTROL_URL)
    parser.add_argument("--viewport", type=int, default=240)
    parser.add_argument("--sleep-after-generate", type=float, default=0.5)
    parser.add_argument("--sleep-between", type=float, default=0.2)
    parser.add_argument("--max-samples", type=int, default=0)
    args = parser.parse_args()

    os.makedirs(args.save_dir, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--use-gl=egl",
                "--enable-webgl",
                "--ignore-gpu-blocklist"
            ]
        )
        page = browser.new_page(
            viewport={
                "width": args.viewport,
                "height": args.viewport
            }
        )

        page.goto(args.viewer_url)
        page.wait_for_selector("canvas")
        page.wait_for_timeout(2000)

        print("Viewer ready")

        idx = 0
        while True:
            try:
                resp = requests.post(args.control_url, timeout=5)
                data = resp.json()
            except Exception as exc:
                print("generate error:", exc)
                time.sleep(0.2)
                continue

            if not data.get("success"):
                print("generate failed:", data.get("error", "unknown"))
                time.sleep(0.2)
                continue

            time.sleep(args.sleep_after_generate)

            image_bytes = page.screenshot()
            save_sample(args.save_dir, idx, image_bytes, data["label"])

            print(idx, data["label"])
            idx += 1

            if args.max_samples and idx >= args.max_samples:
                break

            time.sleep(args.sleep_between)

        browser.close()


if __name__ == "__main__":
    main()
