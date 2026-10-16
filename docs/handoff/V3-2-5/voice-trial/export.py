"""Export only verified trial evidence. Inaccessible discussion feeds never become a successful empty feed."""
import datetime
import json
import pathlib
from zoneinfo import ZoneInfo

base = pathlib.Path('/tmp/workdesk-voice-trial-20261016')
database = json.loads((base / 'database-evidence.json').read_text())
background = json.loads((base / 'official-free-read.json').read_text())
reads = json.loads((base / 'student-source-probes/results.json').read_text())
api = json.loads((base / 'api-evidence.json').read_text())
counts = database['counts']
assert counts['provider_attempts'] == counts['provider_receipts'] == counts['pgboss_schemas'] == counts['enabled_sources'] == 0
assert database['modelCallsEnabled'] is False and database['collectEnabled'] is False
successful = [r for r in reads if r.get('http', '').startswith('200 ') and not r.get('error') and isinstance(r.get('items'), int)]
errors = [{'source': r['source'], 'url': r['url'], 'reason': (r.get('error') or ('HTTP ' + r['http'].split(' ')[0])).strip()} for r in reads if r not in successful]
# Regenerating a file must never make old source reads look fresh.
checked = min(datetime.datetime.fromisoformat(row['checkedAt'].replace('Z', '+00:00')) for row in [database, *reads])
value = {
    'schemaVersion': 1,
    'engine': {'commit': 'c8704e5313e6b051560365226b3919d7e0ada5ea', 'modelCallsEnabled': False, 'paidCollectorsEnabled': False, 'schedulesEnabled': False},
    'checkedAt': checked.isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
    'budget': {'used': 0, 'limit': 10},
    'data': {'updatedAt': checked.astimezone(ZoneInfo('Asia/Shanghai')).strftime('%Y-%m-%d %H:%M'), 'nextAt': None,
             'stats': {'topics': None, 'newTopics': None, 'surge': None, 'participants': None, 'filtered': None, 'sourceCount': None, 'sources': ''},
             'hot': [], 'cloud': [], 'daily': ''},
    'checks': {'paidRequests': 0, 'modelRequests': 0, 'scheduledJobs': 0,
               'sourceReads': {'attempted': len(reads), 'successful': len(successful), 'complete': len(successful) == len(reads) and bool(reads) and all(r.get('complete') is True for r in reads), 'errors': errors},
               'database': database, 'backgroundRead': background,
               'publicApi': [{'path': r['path'], 'method': r.get('method', 'GET'), 'status': r['status']} for r in api],
               'qualification': 'unknown: all student discussion reads failed; policy background is not student evidence',
               'budgetScope': 'isolated manual trial only; zero provider attempts, no cost-generating entry points; this is not a production monthly budget guard'}
}
target = base / 'workdesk-export.json'
temporary = target.with_suffix('.json.tmp')
temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
temporary.replace(target)
print('exported', target, 'student reads', len(successful), '/', len(reads), 'complete', value['checks']['sourceReads']['complete'])
