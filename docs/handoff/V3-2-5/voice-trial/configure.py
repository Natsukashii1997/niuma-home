"""Generate fresh isolated credentials, never read any existing account credentials."""
import pathlib
import secrets

base = pathlib.Path('/tmp/workdesk-voice-trial-20261016')
base.mkdir(exist_ok=True)
(base / 'tmp').mkdir(exist_ok=True)
if (base / 'db.env').exists() or (base / 'engine.env').exists():
    raise SystemExit('existing trial config retained; do not overwrite its database identity')
password = secrets.token_urlsafe(32)
files = {
    'db.env': f'POSTGRES_DB=workdesk_voice_trial\nPOSTGRES_USER=workdesk_voice_trial\nPOSTGRES_PASSWORD={password}\n',
    'engine.env': f'DATABASE_URL=postgres://workdesk_voice_trial:{password}@127.0.0.1:5497/workdesk_voice_trial\n'
    'SITE_URL=http://127.0.0.1:5397\nAPI_HOST=127.0.0.1\nAPI_PORT=5397\nAIHOT_RELEASE=c8704e5313e6b051560365226b3919d7e0ada5ea\n'
    f'AIHOT_CREDENTIALS_DIR={base}/no-credentials\nAIHOT_DATA_DIR={base}/engine-data\n'
    'AIHOT_ENVIRONMENT=workdesk-free-manual-trial\nNODE_ENV=development\nCOLLECT_ENABLED=false\nMODEL_CALLS_ENABLED=false\n'
    'FEISHU_CONTENT_PUSH_ENABLED=false\nFEISHU_INTERNAL_ENABLED=false\nINDEXNOW_SUBMIT_ENABLED=false\n'
}
for name, text in files.items():
    target = base / name
    with target.open('x') as stream:
        target.chmod(0o600)
        stream.write(text)
for name in ['empty.npmrc', 'empty-global.npmrc']:
    (base / name).write_text('')
print('fresh isolated config generated; no credentials printed')
