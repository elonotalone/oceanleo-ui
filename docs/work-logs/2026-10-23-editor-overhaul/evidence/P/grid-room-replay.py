"""Read-only diagnosis, run inside the dev gateway; acceptance account only."""
import base64
import json

from pycrdt import Doc, Map
from app.collab.trail import list_updates, room_row

OWNER = '2ffeef37-102a-431b-b2c2-51c5675dba79'
ROOM = 'artifact:d8bf00e4-7d6f-4110-9988-3ac412957d32'
row = room_row(ROOM)
assert row and row['owner_id'] == OWNER
doc = Doc()
for update in list_updates(ROOM, limit=100):
    doc.apply_update(base64.b64decode(update['update']))
    root = doc.get('oceanleo:grid', type=Map).to_py()
    cells = root.get('entities', {})
    print(json.dumps({
        'seq': update['seq'], 'at': str(update['created_at']),
        'origin': update['origin'], 'format': root.get('format'),
        'cell_count': len(cells), 'example_key': next(iter(cells), None),
        'acceptance_markers': [c.get('v') for c in cells.values() if str(c.get('v', '')).startswith('W10')],
    }, ensure_ascii=False))
