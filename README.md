# 26yaicon1

This repository collects the code and notes used to build a Minecraft-based multi-agent workflow.
The repo is organized by contributor folder, with generated datasets, model weights, and runtime server data excluded from Git.

## Codebase Map

### `hanjin/`

Vision and dataset generation code for the SigLIP-based Minecraft scene tasks.

- `dataset_gen.py`: generates arena classification samples and stores paired PNG/JSON labels.
- `dataset_scene_gen.py`: generates richer scene datasets with structured labels and scene metadata.
- `live_siglip_control.py`: runs live SigLIP inference for arena classification and forwards predictions to the local control API.
- `live_scene_control.py`: runs live scene descriptor inference, keeps short history, and sends action/scene state updates.
- `train_siglip.ipynb`: training notebook for the arena classifier.
- `train_scene_siglip.ipynb`: training notebook for the scene descriptor model.
- `setup.sh` and `server_command.md`: setup and server command notes used while running the environment.

### `jaeeun/`

Minecraft agent and environment preparation materials for the Odyssey-style stack.

- `mineflayer-test/`: Mineflayer bot experiments, arena setup scripts, and run helpers.
- `README.md`: Odyssey project documentation and installation notes.
- `config.json`, `server.properties`, `eula.txt`: local server and model runtime configuration examples.
- `paraphrase-multilingual-MiniLM-L12-v2_README.md`: embedding model notes used by the agent stack.

### `jaehoon/LLM-backend/`

Local LLM backend service used by the Minecraft agent pipeline.

- `main.py`: backend entry point.
- `requirements.txt`: Python dependencies for the backend service.
- `conf/`: runtime configuration files and config templates.
- `README.md`: backend deployment and API usage guide.

### `jinwoo/26yaicon1/`

Lightweight setup notes and startup helper for the project.

- `readme.md`: environment and workflow notes.
- `setup.sh`: shell script for setup or startup steps.

### Other folders

- `legacy/`: older or experimental scripts kept for reference.
- `mineflayer-test/`: standalone Mineflayer experiments and bot prototypes.
- `mf/`: local Minecraft server/runtime workspace. This repository now ignores generated server data and world files.

## What Is Kept In Git

The repository is intended to keep source code, notebooks, configs, and small documentation files.
The following are intentionally excluded:

- generated datasets such as `arena_dataset/`, `arena_scene_dataset/`, `dataset/`, and `dataset_seq/`
- model checkpoints such as `*.pt`, `*.pth`, `*.ckpt`, and `*.onnx`
- Python virtual environments and notebook checkpoints
- Minecraft server runtime data, world data, logs, and bundled jars under `mf/mc-server/`

## Local Workflow

Typical collaboration flow:

1. Create a feature branch for your work.
2. Commit only source changes and small config/docs updates.
3. Pull the latest `main` before merging if other team folders changed.
4. Push through a branch and merge request when possible.

Recommended commands:

```bash
git checkout -b feature/your-name
git add -A
git commit -m "Describe your change"
git push origin feature/your-name
```

## Notes

- If you regenerate datasets or weights locally, keep them outside Git or add them to the ignored paths.
- The Python scripts in `hanjin/` resolve model and dataset paths relative to the repository root, so moving the folder does not break execution.
