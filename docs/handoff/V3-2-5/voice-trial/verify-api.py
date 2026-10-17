import json
import pathlib
import urllib.error
import urllib.request

base = pathlib.Path('/tmp/workdesk-voice-trial-20261016')
checks = [('GET', p) for p in ['/health', '/api/v1/hot-topics', '/api/site/hot', '/api/v1/items', '/api/v1/dailies/latest']]
checks += [('POST', '/api/v1/items'), ('GET', '/api/admin/sources')]
results = []
for method, path in checks:
    request = urllib.request.Request('http://127.0.0.1:5397' + path, method=method)
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            status, body = response.status, json.load(response)
    except urllib.error.HTTPError as error:
        status, body = error.code, json.load(error)
    results.append({'path': path, 'method': method, 'status': status, 'body': body})
(base / 'api-evidence.json').write_text(json.dumps(results, ensure_ascii=False, indent=2) + '\n')
print(json.dumps([{'path': r['path'], 'method': r['method'], 'status': r['status']} for r in results]))
