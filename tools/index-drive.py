"""Manual metadata refresh. Requires a short-lived Drive read token in environment."""
import json,os,time
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.parse import urlencode
root=Path(__file__).resolve().parents[1]
token=os.environ.get('GOOGLE_DRIVE_ACCESS_TOKEN')
if not token:raise SystemExit('Set GOOGLE_DRIVE_ACCESS_TOKEN with Drive metadata read permission. Do not commit it.')
queue=[('1VNuhmAAjTYoj2i20-6ZsfEQF7JNmbnzn','Video')];seen=set();items=[]
while queue:
    fid,folder=queue.pop(0)
    if fid in seen:continue
    seen.add(fid);page=None
    while True:
        params={'q':f"'{fid}' in parents and trashed=false",'pageSize':1000,'fields':'nextPageToken,files(id,name,mimeType)','supportsAllDrives':'true','includeItemsFromAllDrives':'true'}
        if page:params['pageToken']=page
        request=Request('https://www.googleapis.com/drive/v3/files?'+urlencode(params),headers={'Authorization':'Bearer '+token})
        with urlopen(request,timeout=30) as r:data=json.load(r)
        for f in data.get('files',[]):
            if f['mimeType']=='application/vnd.google-apps.folder':queue.append((f['id'],folder+'/'+f['name']))
            else:
                import re
                match=re.search(r'bu[oổ]i\s*(\d+)',f['name'],re.I);number=int(match[1]) if match else None
                items.append({'id':f['id'],'title':f['name'],'mime':f['mimeType'],'folder':folder,'session_no':number,'sort_order':number or 10000+len(items)})
        page=data.get('nextPageToken')
        if not page:break
folder=root/'private-seed';folder.mkdir(exist_ok=True)
(folder/'drive-catalog.json').write_text(json.dumps({'root':'1VNuhmAAjTYoj2i20-6ZsfEQF7JNmbnzn','items':items},ensure_ascii=False),encoding='utf-8')
print(f'Indexed {len(items)} files / {len(seen)} folders. Import the JSON in account admin.')
