#!/bin/bash

set -euo pipefail

if [[ ! -d .venv ]]; then
    python3 -m venv .venv
fi

source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt

python - <<'PY'
from importlib.util import find_spec
from pathlib import Path
import site

if find_spec('pyairports') is None:
    site_packages = Path(next(path for path in site.getsitepackages() if path.endswith('site-packages')))
    package_dir = site_packages / 'pyairports'
    package_dir.mkdir(parents=True, exist_ok=True)
    (package_dir / '__init__.py').write_text('from .airports import AIRPORT_LIST\n', encoding='utf-8')
    (package_dir / 'airports.py').write_text('AIRPORT_LIST = []\n', encoding='utf-8')
    print(f'Created pyairports shim at {package_dir}')
else:
    print('pyairports already available')
PY

echo "Environment setup complete"