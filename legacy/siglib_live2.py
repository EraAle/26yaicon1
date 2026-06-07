import io
import time
import torch
import numpy as np
from PIL import Image
from transformers import AutoProcessor, AutoModel
from playwright.sync_api import sync_playwright

# --- 설정 (Configuration) ---
VIEWER_URL = 'http://localhost:3007'
# CONTROL_URL = 'http://localhost:8082/action' # 나중에 FSM 액션을 보낼 URL
MODEL_ID = 'google/siglip-base-patch16-224'
RENDER_WIDTH = 240
RENDER_HEIGHT = 240

# 감지할 대상 (Semantic Summary State)
TEXTS = [
    'a minecraft zombie',
    'a minecraft skeleton',
    'a minecraft creeper',
    'an empty grassy field in minecraft'
]

def load_siglip(device):
    print(f"Loading SigLIP model ({MODEL_ID}) to {device}...")
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = AutoModel.from_pretrained(MODEL_ID).to(device)
    model.eval()
    print("Model loaded successfully!\n")
    return processor, model

def main():
    # 1. 디바이스 설정 (RTX 3090이 있으므로 cuda로 자동 할당됩니다)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    processor, model = load_siglip(device)

    # 2. Playwright 브라우저 및 뷰어 실행 (한 번만 실행해서 계속 유지)
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
        
        print(f"Opening viewer at {VIEWER_URL}...")
        page.goto(VIEWER_URL)
        page.wait_for_selector('canvas')
        time.sleep(2.0) # 렌더링 대기
        print("Viewer ready. Starting real-time mob detection streaming...\n")

        step = 0
        try:
            # 3. 실시간 스트리밍 루프 (Perception Loop)
            while True:
                start_time = time.time()
                
                # [A] 현재 화면 캡처 (디스크 저장 없이 메모리에서 바로 읽기)
                screenshot_bytes = page.screenshot()
                image = Image.open(io.BytesIO(screenshot_bytes)).convert('RGB')
                
                # [B] SigLIP 전처리 및 모델 추론
                inputs = processor(text=TEXTS, images=image, padding='max_length', return_tensors='pt')
                inputs = {k: v.to(device) for k, v in inputs.items()}
                
                with torch.no_grad():
                    outputs = model(**inputs)
                
                # [C] 결과 확률 계산 (Sigmoid 적용하여 각 클래스별 독립적 확률 도출)
                logits_per_image = outputs.logits_per_image
                probs = torch.sigmoid(logits_per_image)[0].cpu().numpy()
                
                # [D] 결과 출력
                print(f"=== Step {step} | Semantic State ===")
                for text, prob in zip(TEXTS, probs):
                    print(f"  - {text}: {prob * 100:.2f}%")
                
                # FPS 계산
                elapsed = time.time() - start_time
                fps = 1.0 / elapsed
                print(f"  [Inference Time: {elapsed*1000:.1f}ms | FPS: {fps:.1f}]\n")
                
                # -------------------------------------------------------------
                # 💡 여기에 향후 FSM (Finite State Machine) 전투 로직이 들어갑니다.
                # 예시:
                # if probs[0] > 0.85: # 좀비 확률이 85% 이상이면
                #     print("  🚨 좀비 발견! 뒤로 후퇴 (Action: backward)")
                #     urllib.request.urlopen(Request(CONTROL_URL, ... action="backward"))
                # -------------------------------------------------------------

                step += 1
                
                # 루프가 너무 빨리 돌아 CPU/GPU를 100% 점유하는 것을 방지 (초당 약 5~10프레임 권장)
                time.sleep(0.05) 

        except KeyboardInterrupt:
            print("\nInterrupted by user. Stopping the stream...")
        finally:
            browser.close()
            print("Browser closed safely.")

if __name__ == '__main__':
    main()