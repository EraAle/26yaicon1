# Reproducible Inference Snapshot

This workspace is set up to reproduce the JarvisVLA inference flow with the Hugging Face model
`CraftJarvis/JarvisVLA-Qwen2-VL-7B`.

## Verified Environment

| Item | Value |
| --- | --- |
| Python | 3.10.12 |
| PyTorch | 2.4.0+cu121 |
| vLLM | 0.6.3.post1 |
| CUDA driver | 550.107.02 |
| CUDA runtime reported by `nvidia-smi` | 12.4 |
| OS | Ubuntu 22.04.3 LTS |
| GPU | NVIDIA GeForce RTX 3090 |

`HF_HOME` and `TRANSFORMERS_CACHE` are unset in this workspace.

## Run The Server

The vLLM serve entrypoint lives at [JarvisVLA/scripts/inference/serve_vllm.sh](JarvisVLA/scripts/inference/serve_vllm.sh).

```bash
bash ./JarvisVLA/scripts/inference/serve_vllm.sh
```

Useful overrides:

```bash
CUDA_VISIBLE_DEVICES=0 TENSOR_PARALLEL_SIZE=1 VLLM_PORT=9052 \
MODEL_NAME_OR_PATH=CraftJarvis/JarvisVLA-Qwen2-VL-7B \
bash ./JarvisVLA/scripts/inference/serve_vllm.sh
```

## Smoke Test

After the server is up, this request returned successfully in this workspace:

```bash
curl http://localhost:9052/v1/chat/completions \
	-H "Content-Type: application/json" \
	-d '{
		"model": "jarvisvla",
		"messages": [
			{"role": "user", "content": "Hello, who are you?"}
		],
		"max_tokens": 32
	}'
```

## Reproducibility Files

- [requirements.txt](requirements.txt) captures the exact package snapshot from the active virtual environment.
- [env/python_version.txt](env/python_version.txt) records the Python version.
- [env/torch.txt](env/torch.txt) records the PyTorch build.
- [env/cuda.txt](env/cuda.txt) records the driver / CUDA information.
- [env/os_release.txt](env/os_release.txt) records the base OS.
- [env/vllm.txt](env/vllm.txt) records the serving stack version.
- [env/hf_cache.txt](env/hf_cache.txt) records cache environment variables.
- [env/vessl_image.txt](env/vessl_image.txt) records the container image status for this workspace.
- [patches/pyairports_fix.md](patches/pyairports_fix.md) records the monkey-patch note.
- [scripts/setup.sh](scripts/setup.sh) bootstraps the environment and applies the local shim if needed.

## Known Issues

The workspace previously failed on older vLLM builds because the Hugging Face model config used Qwen2-VL style `rope_scaling` metadata that was not accepted by vLLM 0.5.4. This workspace is now documented and verified on vLLM 0.6.3.post1.

If you downgrade the serving stack, re-check model config compatibility before serving.
