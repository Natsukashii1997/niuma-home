"""Run one reviewed entry with only the freshly generated trial environment.
Never loads the user's environment, credential files, default Docker context or AIHOT .env.
"""
import os
import pathlib
import sys

base = pathlib.Path('/tmp/workdesk-voice-trial-20261016')
source = pathlib.Path((base / 'source-path.txt').read_text().strip())
entry = sys.argv[1]
allowed = {'scripts/migrate.ts', 'trial-api.ts', 'trial-probe.ts', 'trial-evidence.ts'}
if entry not in allowed:
    raise SystemExit('unreviewed entry')
env = {'PATH': os.environ['PATH'], 'TMPDIR': str(base / 'tmp')}
for line in (base / 'engine.env').read_text().splitlines():
    if line and not line.startswith('#'):
        key, value = line.split('=', 1)
        env[key] = value
os.chdir(source)
os.execvpe('node', ['node', entry, *sys.argv[2:]], env)
