"""Create private SQL seed from indexed Drive metadata and the read-only syllabus."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
folder=root/'private-seed'
catalog=json.loads((folder/'drive-catalog.json').read_text(encoding='utf-8'))
syllabus=json.loads((folder/'syllabus.json').read_text(encoding='utf-8'))
def quote(value):
    return 'null' if value is None else "'"+str(value).replace("'","''")+"'"
sql=['begin;']
for row in syllabus['rows']:
    if row and str(row[0]).isdigit():
        sql.append(f"insert into public.sessions(id,title) values({int(row[0])},{quote(str(row[2] if len(row)>2 else 'Buổi '+row[0])[:300])}) on conflict(id) do update set title=excluded.title;")
for item in catalog['items']:
    values=[item['id'],item['title'][:300],item['id'],item['mime'],item['folder'],item['session_no'],item['sort_order']]
    sql.append('insert into public.lessons(id,title,drive_id,mime,folder,session_no,sort_order) values('+','.join(quote(v) for v in values)+') on conflict(id) do update set title=excluded.title,mime=excluded.mime,folder=excluded.folder,session_no=excluded.session_no,sort_order=excluded.sort_order;')
sql.append('commit;')
(folder/'002_seed.sql').write_text('\n'.join(sql),encoding='utf-8')
print(f"Seed generated privately: {len(catalog['items'])} resources, {len(syllabus['rows'])} syllabus rows")
