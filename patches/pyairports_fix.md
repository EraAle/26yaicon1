# pyairports Shim Note

The current workspace already has `pyairports==0.0.1` installed, so no manual shim was needed for the successful inference run.

If a future environment drops that dependency and an import error appears, recreate the minimal shim inside the active Python environment:

```bash
python - <<'PY'
from pathlib import Path
import site

site_packages = Path(next(path for path in site.getsitepackages() if path.endswith('site-packages')))
package_dir = site_packages / 'pyairports'
package_dir.mkdir(parents=True, exist_ok=True)
(package_dir / '__init__.py').write_text('from .airports import AIRPORT_LIST\n', encoding='utf-8')
(package_dir / 'airports.py').write_text('AIRPORT_LIST = []\n', encoding='utf-8')
print(f'Created shim at {package_dir}')
PY
```

This is intentionally minimal: it satisfies the import path without introducing new behavior.