from playwright.sync_api import sync_playwright
import numpy as np
import cv2
import time

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
            "width": 240,
            "height": 240
        }
    )

    print("Opening viewer...")

    page.goto("http://localhost:3007")

    # WebGL canvas 기다리기
    page.wait_for_selector("canvas")

    # 월드 렌더링 시간
    time.sleep(3)

    print("Viewer loaded")


    while True:

        screenshot = page.screenshot()

        image = np.frombuffer(
            screenshot,
            dtype=np.uint8
        )

        frame = cv2.imdecode(
            image,
            cv2.IMREAD_COLOR
        )

        if frame is not None:

            cv2.imwrite("frame.jpg", frame)

            cv2.waitKey(1)

            print(frame.shape)

        time.sleep(1 / 6)