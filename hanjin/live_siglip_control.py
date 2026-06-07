import io
import time
import requests
from pathlib import Path

import torch
import torch.nn as nn
from PIL import Image
from transformers import AutoImageProcessor, SiglipVisionModel
from playwright.sync_api import sync_playwright


VIEWER_URL = "http://localhost:3007"
CONTROL_URL = "http://localhost:8082/vision"

REPO_ROOT = Path(__file__).resolve().parent.parent
CHECKPOINT_PATH = REPO_ROOT / "siglip_arena_classifier.pt"

VIEWPORT_SIZE = 240
LOOP_DELAY = 0.08

USE_AMP = True

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

NUM_CLASSES = len(CLASS_NAMES)


class SiglipArenaClassifier(nn.Module):
    def __init__(self, model_name, num_classes):
        super().__init__()

        self.encoder = SiglipVisionModel.from_pretrained(model_name)
        hidden_size = self.encoder.config.hidden_size

        self.classifier = nn.Linear(hidden_size, num_classes)

    def forward(self, pixel_values):
        out = self.encoder(pixel_values=pixel_values)

        if hasattr(out, "pooler_output") and out.pooler_output is not None:
            feat = out.pooler_output
        else:
            feat = out.last_hidden_state.mean(dim=1)

        logits = self.classifier(feat)
        return logits


def load_model():
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("device:", device)

    ckpt = torch.load(CHECKPOINT_PATH, map_location=device)

    model_name = ckpt.get("model_name", "google/siglip-base-patch16-224")
    class_names = ckpt.get("class_names", CLASS_NAMES)

    processor = AutoImageProcessor.from_pretrained(model_name)

    model = SiglipArenaClassifier(model_name, len(class_names))
    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()

    print("loaded:", CHECKPOINT_PATH)
    print("model:", model_name)
    print("classes:", class_names)

    return model, processor, device, class_names


@torch.inference_mode()
def predict_image(model, processor, device, image):
    inputs = processor(
        images=[image],
        return_tensors="pt",
    )

    pixel_values = inputs["pixel_values"].to(device)

    with torch.cuda.amp.autocast(enabled=(USE_AMP and device == "cuda")):
        logits = model(pixel_values)

    probs = torch.softmax(logits, dim=1)[0]
    class_id = int(probs.argmax().item())
    prob = float(probs[class_id].item())

    return class_id, prob, probs.detach().cpu().tolist()


def send_vision(class_id, class_name, prob):
    payload = {
        "class_id": class_id,
        "class_name": class_name,
        "prob": prob,
    }

    try:
        requests.post(CONTROL_URL, json=payload, timeout=0.3)
    except Exception as e:
        print("send failed:", e)


def main():
    model, processor, device, class_names = load_model()

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
                "width": VIEWPORT_SIZE,
                "height": VIEWPORT_SIZE,
            }
        )

        page.goto(VIEWER_URL)
        page.wait_for_selector("canvas")
        page.wait_for_timeout(1500)

        canvas = page.query_selector("canvas")

        last_print = 0

        while True:
            image_bytes = canvas.screenshot()
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

            class_id, prob, probs = predict_image(
                model,
                processor,
                device,
                image,
            )

            class_name = class_names[class_id]

            send_vision(class_id, class_name, prob)

            now = time.time()
            if now - last_print > 0.3:
                print(f"{class_id}: {class_name:24s} prob={prob:.3f}")
                last_print = now

            time.sleep(LOOP_DELAY)


if __name__ == "__main__":
    main()