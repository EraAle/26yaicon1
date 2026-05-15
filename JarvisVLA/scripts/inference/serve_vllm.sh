#!/bin/bash

set -euo pipefail

cuda_visible_devices="${CUDA_VISIBLE_DEVICES:-0}"
card_num="${TENSOR_PARALLEL_SIZE:-1}"
port="${VLLM_PORT:-9052}"

# Default to the Hugging Face model. Override with MODEL_NAME_OR_PATH if needed.
model_name_or_path="${MODEL_NAME_OR_PATH:-CraftJarvis/JarvisVLA-Qwen2-VL-7B}"
served_model_name="${SERVED_MODEL_NAME:-jarvisvla}"

CUDA_VISIBLE_DEVICES="$cuda_visible_devices" vllm serve "$model_name_or_path" \
    --port "$port" \
    --max-model-len 4096 \
    --max-num-seqs 10 \
    --gpu-memory-utilization 0.95 \
    --tensor-parallel-size "$card_num" \
    --trust-remote-code \
    --served-model-name "$served_model_name" \
    #--limit-mm-per-prompt '{"image": 5}'
    #--max-model-len 8448 \
