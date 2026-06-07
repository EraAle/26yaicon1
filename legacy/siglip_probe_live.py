#!/usr/bin/env python3
"""
Capture an image from the viewer (or load a local image) and run SigLIP zero-shot probing.
Usage:
  python siglip_probe_live.py            # capture from http://localhost:3007
  python siglip_probe_live.py --file img.png

Requires: pip install transformers torch pillow playwright
(If using Playwright, run `playwright install` once.)
"""
import argparse
import io
import time
import torch
from PIL import Image
from transformers import AutoProcessor, AutoModel
from playwright.sync_api import sync_playwright

VIEWER_URL = 'http://localhost:3007'
MODEL_ID = 'google/siglip-base-patch16-224'

TEXTS = [
    'a minecraft zombie',
    'a minecraft skeleton',
    'a minecraft creeper',
    'an empty grassy field in minecraft',
    'a close up of a minecraft sword'
]


def load_model(device):
    print('Loading SigLIP model:', MODEL_ID)
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = AutoModel.from_pretrained(MODEL_ID).to(device)
    model.eval()
    print('Model loaded on', device)
    return processor, model


def infer_image(processor, model, image, texts, device):
    inputs = processor(text=texts, images=image, padding='max_length', return_tensors='pt')
    inputs = {k: v.to(device) for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model(**inputs)
    logits_per_image = outputs.logits_per_image  # (batch=1, num_texts)
    probs = torch.sigmoid(logits_per_image)
    return probs.cpu().numpy()


def capture_from_viewer(viewer_url, viewport=(240, 240)):
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--use-gl=egl", "--enable-webgl", "--ignore-gpu-blocklist"])
        page = browser.new_page(viewport={'width': viewport[0], 'height': viewport[1]})
        print('Opening viewer at', viewer_url)
        page.goto(viewer_url)
        page.wait_for_selector('canvas')
        time.sleep(1.0)
        screenshot = page.screenshot()
        browser.close()
    image = Image.open(io.BytesIO(screenshot)).convert('RGB')
    return image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--file', '-f', help='Local image file to load instead of capturing viewer')
    parser.add_argument('--device', '-d', default=None, help='torch device (cuda/cpu)')
    parser.add_argument('--interval', '-i', type=float, default=1.0, help='Seconds to wait between repeated probes')
    parser.add_argument('--count', '-n', type=int, default=0, help='Number of probes to run (0 = infinite)')
    args = parser.parse_args()

    device = args.device if args.device is not None else ('cuda' if torch.cuda.is_available() else 'cpu')
    device = torch.device(device)

    processor, model = load_model(device)

    if args.file:
        print('Loading local image:', args.file)
        image = Image.open(args.file).convert('RGB')
    else:
        image = None

    probe_index = 0
    while True:
        if args.file:
            current_image = image
        else:
            current_image = capture_from_viewer(VIEWER_URL, viewport=(240, 240))

        start = time.time()
        probs = infer_image(processor, model, current_image, TEXTS, device)
        elapsed = time.time() - start

        print(f'\n=== SigLIP Zero-shot Probing Results #{probe_index} ===')
        for text, p in zip(TEXTS, probs[0]):
            print(f"{text}: {float(p)*100:.2f}%")
        print(f'Elapsed inference: {elapsed*1000:.1f} ms')

        probe_index += 1
        if args.count > 0 and probe_index >= args.count:
            break
        time.sleep(args.interval)


if __name__ == '__main__':
    main()
