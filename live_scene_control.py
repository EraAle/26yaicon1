import io
import time
import json
import asyncio
import requests
from collections import deque

import torch
import torch.nn as nn
from PIL import Image
from transformers import AutoImageProcessor, SiglipVisionModel
from playwright.async_api import async_playwright


# =========================
# Config
# =========================

CHECKPOINT_PATH = "siglip_scene_descriptor.pt"

VIEWER_URL = "http://localhost:3007"

SCENE_STATE_URL = "http://localhost:8082/scene_state"
ACTION_URL = "http://localhost:8082/action"

VIEWPORT_WIDTH = 320
VIEWPORT_HEIGHT = 180
IMAGE_SIZE = 224

LIVE_LOOP_DELAY = 0.12
PRINT_INTERVAL = 0.5

LLM_DECISION_INTERVAL = 0.5

SCENE_HISTORY_LEN = 6
ACTION_HISTORY_LEN = 5

USE_AMP = True


# =========================
# Ollama Config
# =========================

USE_OLLAMA_LLM = True

OLLAMA_CHAT_URL = "http://localhost:11434/api/chat"
OLLAMA_MODEL = "qwen3:1.7b"

OLLAMA_TIMEOUT = 5.0
OLLAMA_NUM_PREDICT = 256

LLM_MAX_RETRY = 1


# =========================
# History
# =========================

scene_history = deque(maxlen=SCENE_HISTORY_LEN)
action_history = deque(maxlen=ACTION_HISTORY_LEN)


# =========================
# Label names
# =========================

TYPE_NAMES = [
    "none",
    "zombie",
    "skeleton",
]

DISTANCE_BIN_NAMES = [
    "none",
    "too_close",
    "attackable",
    "near",
    "far",
]

HORIZONTAL_BIN_NAMES = [
    "none",
    "center",
    "left",
    "right",
    "far_left",
    "far_right",
]

VERTICAL_BIN_NAMES = [
    "middle",
    "up",
    "down",
]

COUNT_BIN_NAMES = [
    "0",
    "1",
    "2",
    "3",
    "4+",
]

HEAD_DIMS = {
    "nearest_type": len(TYPE_NAMES),
    "nearest_distance": len(DISTANCE_BIN_NAMES),
    "nearest_horizontal": len(HORIZONTAL_BIN_NAMES),
    "nearest_vertical": len(VERTICAL_BIN_NAMES),
    "visible_entity_count": len(COUNT_BIN_NAMES),
    "visible_zombie_count": len(COUNT_BIN_NAMES),
    "visible_skeleton_count": len(COUNT_BIN_NAMES),
}

BINARY_HEADS = [
    "has_visible_entity",
    "multiple_entities",
    "nearest_too_close",
    "nearest_attackable",
]

VALID_ACTIONS = [
    "scan",
    "turn_left",
    "turn_right",
    "move_forward",
    "retreat",
    "attack",
    "stop",
]


# =========================
# Utils
# =========================

def letterbox_to_square(image, size=224):
    image = image.convert("RGB")

    w, h = image.size
    scale = size / max(w, h)

    new_w = int(round(w * scale))
    new_h = int(round(h * scale))

    resized = image.resize((new_w, new_h), Image.BICUBIC)

    canvas = Image.new("RGB", (size, size), (0, 0, 0))

    left = (size - new_w) // 2
    top = (size - new_h) // 2

    canvas.paste(resized, (left, top))

    return canvas


def extract_json_object(text):
    text = text.strip()

    if text.startswith("```"):
        text = text.replace("```json", "")
        text = text.replace("```", "")
        text = text.strip()

    start = text.find("{")
    end = text.rfind("}")

    if start < 0 or end < 0 or end <= start:
        raise ValueError(f"No JSON object found in text: {text[:200]}")

    return text[start:end + 1]


# =========================
# Model
# =========================

class SiglipSceneDescriptor(nn.Module):
    def __init__(self, model_name, head_dims, binary_heads):
        super().__init__()

        self.encoder = SiglipVisionModel.from_pretrained(model_name)
        hidden_size = self.encoder.config.hidden_size

        self.ce_heads = nn.ModuleDict({
            name: nn.Linear(hidden_size, dim)
            for name, dim in head_dims.items()
        })

        self.binary_heads = nn.ModuleDict({
            name: nn.Linear(hidden_size, 1)
            for name in binary_heads
        })

    def forward(self, pixel_values):
        out = self.encoder(pixel_values=pixel_values)

        if hasattr(out, "pooler_output") and out.pooler_output is not None:
            feat = out.pooler_output
        else:
            feat = out.last_hidden_state.mean(dim=1)

        outputs = {}

        for name, head in self.ce_heads.items():
            outputs[name] = head(feat)

        for name, head in self.binary_heads.items():
            outputs[name] = head(feat).squeeze(-1)

        return outputs


def load_model():
    device = "cuda" if torch.cuda.is_available() else "cpu"

    print("device:", device)

    if device == "cuda":
        print(torch.cuda.get_device_name(0))

    ckpt = torch.load(CHECKPOINT_PATH, map_location=device)

    model_name = ckpt.get("model_name", "google/siglip-base-patch16-224")

    head_dims = ckpt.get("head_dims", HEAD_DIMS)
    binary_heads = ckpt.get("binary_heads", BINARY_HEADS)

    names = {
        "type_names": ckpt.get("type_names", TYPE_NAMES),
        "distance_bin_names": ckpt.get("distance_bin_names", DISTANCE_BIN_NAMES),
        "horizontal_bin_names": ckpt.get("horizontal_bin_names", HORIZONTAL_BIN_NAMES),
        "vertical_bin_names": ckpt.get("vertical_bin_names", VERTICAL_BIN_NAMES),
        "count_bin_names": ckpt.get("count_bin_names", COUNT_BIN_NAMES),
    }

    processor = AutoImageProcessor.from_pretrained(model_name)

    model = SiglipSceneDescriptor(
        model_name=model_name,
        head_dims=head_dims,
        binary_heads=binary_heads,
    )

    model.load_state_dict(ckpt["model_state_dict"])
    model.to(device)
    model.eval()

    print("loaded:", CHECKPOINT_PATH)
    print("model:", model_name)

    return model, processor, device, head_dims, binary_heads, names


# =========================
# Prediction
# =========================

@torch.no_grad()
def predict_scene_from_pil(
    image,
    model,
    processor,
    device,
    head_dims,
    binary_heads,
):
    image_lb = letterbox_to_square(image, IMAGE_SIZE)

    inputs = processor(
        images=[image_lb],
        return_tensors="pt",
        do_resize=False,
    )

    pixel_values = inputs["pixel_values"].to(device)

    if device == "cuda":
        with torch.amp.autocast("cuda", enabled=USE_AMP):
            outputs = model(pixel_values)
    else:
        outputs = model(pixel_values)

    result = {}

    for name in head_dims.keys():
        probs = torch.softmax(outputs[name], dim=1)[0]
        pred = int(probs.argmax().item())

        result[name] = {
            "id": pred,
            "prob": float(probs[pred].item()),
            "probs": probs.detach().cpu().tolist(),
        }

    for name in binary_heads:
        prob = float(torch.sigmoid(outputs[name])[0].item())

        result[name] = {
            "value": prob >= 0.5,
            "prob": prob,
        }

    return result


def result_to_scene_text(result, names):
    type_names = names["type_names"]
    distance_bin_names = names["distance_bin_names"]
    horizontal_bin_names = names["horizontal_bin_names"]
    vertical_bin_names = names["vertical_bin_names"]
    count_bin_names = names["count_bin_names"]

    has_entity = result["has_visible_entity"]["value"]

    if not has_entity:
        return "No hostile entity is visible."

    nearest_type = type_names[result["nearest_type"]["id"]]
    nearest_distance = distance_bin_names[result["nearest_distance"]["id"]]
    nearest_horizontal = horizontal_bin_names[result["nearest_horizontal"]["id"]]
    nearest_vertical = vertical_bin_names[result["nearest_vertical"]["id"]]

    visible_count = count_bin_names[result["visible_entity_count"]["id"]]
    zombie_count = count_bin_names[result["visible_zombie_count"]["id"]]
    skeleton_count = count_bin_names[result["visible_skeleton_count"]["id"]]

    too_close = result["nearest_too_close"]["value"]
    attackable = result["nearest_attackable"]["value"]
    multiple = result["multiple_entities"]["value"]

    text = ""

    text += f"Visible hostile entities: {visible_count}. "
    text += f"Visible zombies: {zombie_count}. "
    text += f"Visible skeletons: {skeleton_count}. "

    text += (
        f"The nearest visible entity is a {nearest_type}, "
        f"located at {nearest_horizontal} and {nearest_vertical}, "
        f"at {nearest_distance} distance. "
    )

    if too_close:
        text += "The nearest entity is too close. "

    if attackable:
        text += "The nearest entity is within attack range. "

    if multiple:
        text += "Multiple hostile entities are visible. "

    return text


def prediction_to_payload(result, names):
    type_names = names["type_names"]
    distance_bin_names = names["distance_bin_names"]
    horizontal_bin_names = names["horizontal_bin_names"]
    vertical_bin_names = names["vertical_bin_names"]
    count_bin_names = names["count_bin_names"]

    payload = {
        "has_visible_entity": result["has_visible_entity"]["value"],
        "multiple_entities": result["multiple_entities"]["value"],

        "nearest_type": type_names[result["nearest_type"]["id"]],
        "nearest_distance": distance_bin_names[result["nearest_distance"]["id"]],
        "nearest_horizontal": horizontal_bin_names[result["nearest_horizontal"]["id"]],
        "nearest_vertical": vertical_bin_names[result["nearest_vertical"]["id"]],

        "nearest_too_close": result["nearest_too_close"]["value"],
        "nearest_attackable": result["nearest_attackable"]["value"],

        "visible_entity_count": count_bin_names[result["visible_entity_count"]["id"]],
        "visible_zombie_count": count_bin_names[result["visible_zombie_count"]["id"]],
        "visible_skeleton_count": count_bin_names[result["visible_skeleton_count"]["id"]],
    }

    payload["scene_text"] = result_to_scene_text(result, names)

    return payload


# =========================
# HTTP Send
# =========================

def send_scene_payload(payload):
    try:
        r = requests.post(
            SCENE_STATE_URL,
            json=payload,
            timeout=0.3,
        )

        if r.status_code != 200:
            print("scene send failed:", r.status_code, r.text[:200])

    except Exception as e:
        print("scene send failed:", e)


def send_action_payload(action_payload):
    try:
        r = requests.post(
            ACTION_URL,
            json=action_payload,
            timeout=0.3,
        )

        if r.status_code != 200:
            print("action send failed:", r.status_code, r.text[:200])

    except Exception as e:
        print("action send failed:", e)


# =========================
# History
# =========================

def add_scene_history(payload):
    scene_history.append({
        "time": time.time(),

        "has_visible_entity": payload["has_visible_entity"],
        "nearest_type": payload["nearest_type"],
        "nearest_distance": payload["nearest_distance"],
        "nearest_horizontal": payload["nearest_horizontal"],
        "nearest_vertical": payload["nearest_vertical"],

        "nearest_too_close": payload["nearest_too_close"],
        "nearest_attackable": payload["nearest_attackable"],

        "visible_entity_count": payload["visible_entity_count"],
        "visible_zombie_count": payload["visible_zombie_count"],
        "visible_skeleton_count": payload["visible_skeleton_count"],

        "scene_text": payload["scene_text"],
    })


def add_action_history(action_payload):
    action_history.append({
        "time": time.time(),
        "action": action_payload.get("action", "stop"),
        "duration_ms": action_payload.get("duration_ms", 300),
        "reason": action_payload.get("reason", ""),
    })


# =========================
# Formatting
# =========================

def format_action_history():
    if len(action_history) == 0:
        return "No previous actions."

    lines = []
    recent = list(action_history)

    for i, act in enumerate(recent):
        lines.append(
            f"a-{len(recent)-1-i}: "
            f"action={act['action']}, "
            f"duration_ms={act['duration_ms']}, "
            f"reason={act['reason']}"
        )

    return "\n".join(lines)


def format_scene_history():
    if len(scene_history) == 0:
        return "No visual observations."

    lines = []
    recent = list(scene_history)

    for i, obs in enumerate(recent):
        lines.append(
            f"t-{len(recent)-1-i}: "
            f"type={obs['nearest_type']}, "
            f"distance={obs['nearest_distance']}, "
            f"horizontal={obs['nearest_horizontal']}, "
            f"vertical={obs['nearest_vertical']}, "
            f"too_close={obs['nearest_too_close']}, "
            f"attackable={obs['nearest_attackable']}, "
            f"visible_count={obs['visible_entity_count']}"
        )

    return "\n".join(lines)


def summarize_action_effect():
    if len(scene_history) < 2 or len(action_history) == 0:
        return "Not enough history to evaluate the previous action."

    scenes = list(scene_history)
    actions = list(action_history)

    prev_scene = scenes[-2]
    curr_scene = scenes[-1]
    last_action = actions[-1]["action"]

    effects = []

    if last_action in ["turn_left", "turn_right"]:
        if prev_scene["nearest_horizontal"] != "center" and curr_scene["nearest_horizontal"] == "center":
            effects.append("The previous turn improved target alignment toward center.")
        elif prev_scene["nearest_horizontal"] == curr_scene["nearest_horizontal"]:
            effects.append("The previous turn did not significantly change target alignment.")

    if last_action == "move_forward":
        if prev_scene["nearest_distance"] in ["far", "near"] and curr_scene["nearest_distance"] in ["attackable", "too_close"]:
            effects.append("The previous forward movement brought the target closer.")
        elif curr_scene["nearest_distance"] == "far":
            effects.append("The target is still far after moving forward.")

    if last_action == "retreat":
        if prev_scene["nearest_too_close"] and not curr_scene["nearest_too_close"]:
            effects.append("The previous retreat increased distance from the target.")
        elif curr_scene["nearest_too_close"]:
            effects.append("The target is still too close after retreating.")

    if last_action == "attack":
        if not curr_scene["has_visible_entity"]:
            effects.append("After attacking, no hostile entity is visible. The target may be defeated.")
        elif curr_scene["nearest_attackable"]:
            effects.append("The target is still attackable after the previous attack.")

    if len(effects) == 0:
        effects.append("No clear effect from the previous action.")

    return " ".join(effects)


# =========================
# LLM action validation
# =========================

def validate_llm_action(action_payload):
    if len(scene_history) == 0:
        return True, ""

    curr = list(scene_history)[-1]

    action = action_payload["action"]

    has_entity = curr["has_visible_entity"]
    nearest_type = curr["nearest_type"]
    distance = curr["nearest_distance"]
    horizontal = curr["nearest_horizontal"]
    too_close = curr["nearest_too_close"]
    attackable = curr["nearest_attackable"]

    if not has_entity or nearest_type == "none":
        if action == "scan":
            return True, ""
        return False, "No hostile entity is visible. The correct action is scan."

    if action == "stop":
        return False, "A hostile entity is visible. stop is forbidden."

    if too_close or distance == "too_close":
        if action == "retreat":
            return True, ""
        return False, "The nearest entity is too_close. The correct action is retreat."

    if horizontal in ["left", "far_left"]:
        if action == "turn_left":
            return True, ""
        return False, "The nearest entity is on the left. The correct action is turn_left."

    if horizontal in ["right", "far_right"]:
        if action == "turn_right":
            return True, ""
        return False, "The nearest entity is on the right. The correct action is turn_right."

    if horizontal == "center":
        if attackable or distance == "attackable":
            if action == "attack":
                return True, ""
            return False, "The nearest entity is centered and attackable. The correct action is attack."

        if distance in ["near", "far"]:
            if action == "move_forward":
                return True, ""
            return False, "The nearest entity is centered but not attackable. The correct action is move_forward."

    return True, ""


# =========================
# Ollama LLM
# =========================

def get_current_observation_json():
    if len(scene_history) > 0:
        curr = list(scene_history)[-1]

        return {
            "has_visible_entity": curr["has_visible_entity"],
            "nearest_type": curr["nearest_type"],
            "nearest_distance": curr["nearest_distance"],
            "nearest_horizontal": curr["nearest_horizontal"],
            "nearest_vertical": curr["nearest_vertical"],
            "nearest_too_close": curr["nearest_too_close"],
            "nearest_attackable": curr["nearest_attackable"],
            "visible_entity_count": curr["visible_entity_count"],
            "visible_zombie_count": curr["visible_zombie_count"],
            "visible_skeleton_count": curr["visible_skeleton_count"],
        }

    return {
        "has_visible_entity": False,
        "nearest_type": "none",
        "nearest_distance": "none",
        "nearest_horizontal": "none",
        "nearest_vertical": "middle",
        "nearest_too_close": False,
        "nearest_attackable": False,
        "visible_entity_count": "0",
        "visible_zombie_count": "0",
        "visible_skeleton_count": "0",
    }


def build_llm_prompt(correction_feedback=None, previous_bad_action=None):
    current_observation = get_current_observation_json()

    correction_text = ""

    if correction_feedback is not None:
        correction_text = f"""
Your previous answer was invalid.

Previous bad action:
{json.dumps(previous_bad_action, indent=2)}

Why it was invalid:
{correction_feedback}

Choose again. Follow the priority rules exactly.
""".strip()

    prompt = f"""
You are the decision module of a Minecraft combat bot.

You must choose exactly one action.

Available actions:
- scan
- turn_left
- turn_right
- move_forward
- retreat
- attack
- stop

Current observation JSON:
{json.dumps(current_observation, indent=2)}

Priority rules. Apply them in this exact order:

1. If has_visible_entity is false OR nearest_type is "none":
   action = scan

2. Else if nearest_too_close is true OR nearest_distance is "too_close":
   action = retreat

3. Else if nearest_horizontal is "left" OR nearest_horizontal is "far_left":
   action = turn_left

4. Else if nearest_horizontal is "right" OR nearest_horizontal is "far_right":
   action = turn_right

5. Else if nearest_horizontal is "center" AND nearest_attackable is true:
   action = attack

6. Else if nearest_horizontal is "center" AND nearest_distance is "attackable":
   action = attack

7. Else if nearest_horizontal is "center" AND nearest_distance is "near":
   action = move_forward

8. Else if nearest_horizontal is "center" AND nearest_distance is "far":
   action = move_forward

9. action = stop only if none of the above rules apply.
   Never choose stop when a hostile entity is visible.

Duration rules:
- scan: 400
- turn_left: 350
- turn_right: 350
- move_forward: 500
- retreat: 500
- attack: 600
- stop: 100

Examples:

Observation:
{{"has_visible_entity": true, "nearest_type": "zombie", "nearest_distance": "too_close", "nearest_horizontal": "center", "nearest_too_close": true, "nearest_attackable": false}}
Output:
{{"action":"retreat","duration_ms":500,"reason":"The nearest zombie is too close."}}

Observation:
{{"has_visible_entity": true, "nearest_type": "zombie", "nearest_distance": "far", "nearest_horizontal": "center", "nearest_too_close": false, "nearest_attackable": false}}
Output:
{{"action":"move_forward","duration_ms":500,"reason":"The zombie is centered but far."}}

Observation:
{{"has_visible_entity": true, "nearest_type": "zombie", "nearest_distance": "attackable", "nearest_horizontal": "center", "nearest_too_close": false, "nearest_attackable": true}}
Output:
{{"action":"attack","duration_ms":600,"reason":"The zombie is centered and attackable."}}

Observation:
{{"has_visible_entity": true, "nearest_type": "skeleton", "nearest_distance": "far", "nearest_horizontal": "far_left", "nearest_too_close": false, "nearest_attackable": false}}
Output:
{{"action":"turn_left","duration_ms":350,"reason":"The skeleton is far left."}}

Recent visual history:
{format_scene_history()}

Recent action history:
{format_action_history()}

Previous action effect:
{summarize_action_effect()}

{correction_text}

Return only valid JSON.
Do not use markdown.
Do not explain outside JSON.

Required JSON format:
{{
  "action": "scan",
  "duration_ms": 400,
  "reason": "brief reason"
}}
""".strip()

    return prompt


def normalize_action_payload(obj):
    if not isinstance(obj, dict):
        raise ValueError("LLM output is not a JSON object")

    action = str(obj.get("action", "stop")).strip()

    if action not in VALID_ACTIONS:
        raise ValueError(f"Invalid action from LLM: {action}")

    duration_ms = obj.get("duration_ms", 300)

    try:
        duration_ms = int(duration_ms)
    except Exception:
        duration_ms = 300

    duration_ms = max(100, min(2000, duration_ms))

    min_duration_by_action = {
        "scan": 400,
        "turn_left": 350,
        "turn_right": 350,
        "move_forward": 500,
        "retreat": 500,
        "attack": 600,
        "stop": 100,
    }

    duration_ms = max(duration_ms, min_duration_by_action.get(action, 300))

    reason = str(obj.get("reason", ""))[:200]

    return {
        "action": action,
        "duration_ms": duration_ms,
        "reason": reason,
    }


def call_ollama_llm(correction_feedback=None, previous_bad_action=None):
    prompt = build_llm_prompt(
        correction_feedback=correction_feedback,
        previous_bad_action=previous_bad_action,
    )

    body = {
        "model": OLLAMA_MODEL,
        "stream": False,
        "format": "json",
        "think": False,
        "options": {
            "temperature": 0,
            "num_predict": OLLAMA_NUM_PREDICT,
        },
        "messages": [
            {
                "role": "system",
                "content": (
                    "/no_think\n"
                    "You are a strict Minecraft bot action selector. "
                    "You must follow the priority rules exactly. "
                    "Return only valid JSON. "
                    "Never output markdown. "
                    "Never output chain-of-thought."
                ),
            },
            {
                "role": "user",
                "content": "/no_think\n" + prompt,
            },
        ],
    }

    r = requests.post(
        OLLAMA_CHAT_URL,
        json=body,
        timeout=OLLAMA_TIMEOUT,
    )

    if r.status_code != 200:
        raise RuntimeError(f"Ollama HTTP {r.status_code}: {r.text[:300]}")

    data = r.json()

    content = ""

    if "message" in data and isinstance(data["message"], dict):
        content = data["message"].get("content", "")
    elif "response" in data:
        content = data.get("response", "")

    content = content.strip()

    if not content:
        print("[ollama raw response]", data)
        raise RuntimeError("Empty Ollama response")

    json_text = extract_json_object(content)

    try:
        obj = json.loads(json_text)
    except Exception as e:
        raise RuntimeError(f"Failed to parse Ollama JSON: {content[:300]}") from e

    return normalize_action_payload(obj)


def decide_action_llm_only():
    if not USE_OLLAMA_LLM:
        raise RuntimeError("USE_OLLAMA_LLM is False")

    try:
        action_payload = call_ollama_llm()

        ok, reason = validate_llm_action(action_payload)

        if ok:
            return action_payload, "ollama"

        print("[llm invalid]", action_payload, reason)

        corrected_payload = call_ollama_llm(
            correction_feedback=reason,
            previous_bad_action=action_payload,
        )

        ok, reason = validate_llm_action(corrected_payload)

        if ok:
            return corrected_payload, "ollama_retry"

        print("[llm retry invalid]", corrected_payload, reason)

        return {
            "action": "stop",
            "duration_ms": 100,
            "reason": "LLM failed to produce a valid action after retry."
        }, "llm_failed"

    except Exception as e:
        print("[llm error]", e)

        return {
            "action": "stop",
            "duration_ms": 100,
            "reason": f"LLM call failed: {str(e)[:120]}"
        }, "llm_error"


# =========================
# Live loop
# =========================

async def run_live_scene_loop():
    model, processor, device, head_dims, binary_heads, names = load_model()

    last_print = 0
    last_decision_time = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=[
                "--use-gl=egl",
                "--enable-webgl",
                "--ignore-gpu-blocklist",
            ],
        )

        page = await browser.new_page(
            viewport={
                "width": VIEWPORT_WIDTH,
                "height": VIEWPORT_HEIGHT,
            }
        )

        print("opening viewer...")
        await page.goto(VIEWER_URL)

        print("waiting canvas...")
        await page.wait_for_selector("canvas", timeout=10000)

        print("canvas found")
        await page.wait_for_timeout(1500)

        canvas = await page.query_selector("canvas")

        print("live scene control started")
        print("viewer:", VIEWER_URL)
        print("scene_state:", SCENE_STATE_URL)
        print("action:", ACTION_URL)
        print("ollama:", OLLAMA_CHAT_URL)
        print("ollama model:", OLLAMA_MODEL)
        print("use ollama:", USE_OLLAMA_LLM)
        print("stop: Ctrl+C")

        try:
            while True:
                image_bytes = await canvas.screenshot()
                image = Image.open(io.BytesIO(image_bytes)).convert("RGB")

                result = predict_scene_from_pil(
                    image=image,
                    model=model,
                    processor=processor,
                    device=device,
                    head_dims=head_dims,
                    binary_heads=binary_heads,
                )

                payload = prediction_to_payload(result, names)

                await asyncio.to_thread(send_scene_payload, payload)

                add_scene_history(payload)

                now = time.time()

                if now - last_decision_time > LLM_DECISION_INTERVAL:
                    action_payload, source = await asyncio.to_thread(decide_action_llm_only)

                    await asyncio.to_thread(send_action_payload, action_payload)

                    add_action_history(action_payload)

                    print(f"[action:{source}]", action_payload)

                    last_decision_time = now

                if now - last_print > PRINT_INTERVAL:
                    print(payload["scene_text"])
                    last_print = now

                await asyncio.sleep(LIVE_LOOP_DELAY)

        finally:
            await browser.close()


def main():
    try:
        asyncio.run(run_live_scene_loop())
    except KeyboardInterrupt:
        print("\nstopped")


if __name__ == "__main__":
    main()