"""Local curator storage, separate from browser workspaces and model weights."""
import base64, json, os, threading, uuid
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1].parent/'tdn-models'/'learning-gallery'
LOCK=threading.RLock()
MAX_FILE=12*1024*1024
TYPES={'html':'text/html; charset=utf-8','pdf':'application/pdf','md':'text/plain; charset=utf-8','txt':'text/plain; charset=utf-8'}
SANDBOX="sandbox allow-scripts allow-downloads; default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' https:; style-src 'unsafe-inline' https:; img-src data: blob: https:; font-src data: https:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"

def listing():
    with LOCK:
        path=ROOT/'catalog.json'
        return json.loads(path.read_text(encoding='utf-8')) if path.exists() else []

def save(items):
    ROOT.mkdir(parents=True,exist_ok=True)
    temp=ROOT/'catalog.tmp'
    temp.write_text(json.dumps(items,ensure_ascii=False,indent=2),encoding='utf-8')
    os.replace(temp,ROOT/'catalog.json')

def add(payload):
    if not isinstance(payload,dict):raise ValueError('Dữ liệu không hợp lệ.')
    fields={}
    for key,limit in [('title',160),('topic',60),('summary',500)]:
        value=payload.get(key,'')
        if not isinstance(value,str) or len(value.strip())>limit:raise ValueError('Thông tin tài liệu quá dài.')
        fields[key]=value.strip()
    if not fields['title'] or not fields['topic']:raise ValueError('Cần tiêu đề và chủ đề.')
    name=payload.get('filename','')
    if not isinstance(name,str) or len(name)>200:raise ValueError('Tên tệp không hợp lệ.')
    kind=Path(name).suffix.lower().lstrip('.')
    if kind not in TYPES:raise ValueError('Chỉ nhận HTML, PDF, Markdown hoặc TXT.')
    encoded=payload.get('data','')
    if not isinstance(encoded,str) or len(encoded)>MAX_FILE*4//3+8:raise ValueError('Tệp tối đa 12 MB.')
    try:raw=base64.b64decode(encoded,validate=True)
    except Exception as error:raise ValueError('Dữ liệu tệp không hợp lệ.') from error
    if not 0<len(raw)<=MAX_FILE:raise ValueError('Tệp rỗng hoặc lớn hơn 12 MB.')
    if kind=='pdf':
        if not raw.startswith(b'%PDF-'):raise ValueError('Tệp không có định dạng PDF hợp lệ.')
    else:
        try:raw.decode('utf-8-sig')
        except UnicodeDecodeError as error:raise ValueError('Tệp văn bản phải dùng UTF-8.') from error
    with LOCK:
        items=listing()
        if len(items)>=500:raise ValueError('Đã đạt giới hạn 500 tài liệu bổ sung.')
        ident=uuid.uuid4().hex
        item={**fields,'id':ident,'kind':kind,'bytes':len(raw),'source':'Người quản lý',
              'originalName':Path(name).name,'custom':True,'url':'/api/learning/assets/'+ident}
        ROOT.mkdir(parents=True,exist_ok=True)
        path=ROOT/(ident+'.'+kind);path.write_bytes(raw)
        try:save([*items,item])
        except Exception:path.unlink(missing_ok=True);raise
        return item

def remove(ident):
    with LOCK:
        items=listing();item=next((i for i in items if i['id']==ident),None)
        if not item:raise ValueError('Không tìm thấy tài liệu bổ sung.')
        save([i for i in items if i['id']!=ident])
        (ROOT/(item['id']+'.'+item['kind'])).unlink(missing_ok=True)

def asset(ident):
    item=next((i for i in listing() if i['id']==ident),None)
    if not item:raise ValueError('Không tìm thấy tài liệu.')
    return ROOT/(item['id']+'.'+item['kind']), TYPES[item['kind']],item

def handle(handler,route):
    # Local curator only, not a public multi-user administrator/login system.
    from urllib.parse import urlsplit
    origin=urlsplit(handler.headers.get('Origin','http://localhost'))
    host=(handler.headers.get('Host') or '').split(':')[0]
    if handler.client_address[0] not in ('127.0.0.1','::1') or host not in ('localhost','127.0.0.1') or origin.hostname not in ('localhost','127.0.0.1') or origin.scheme!='http':
        return handler.reply(403,{'error':'Quản lý Gallery chỉ dùng trên máy local.'})
    if not handler.authorized():return
    try:
        if handler.command=='GET':
            if route=='/api/learning/catalog':return handler.reply(200,{'items':listing(),'canManage':True})
            if route.startswith('/api/learning/assets/'):
                path,mime,item=asset(route.rsplit('/',1)[-1])
                handler.send_response(200);handler.send_header('Content-Type',mime)
                handler.send_header('Content-Length',str(path.stat().st_size))
                handler.send_header('Cache-Control','private, max-age=3600')
                if item['kind']=='html':handler.send_header('Content-Security-Policy',SANDBOX)
                handler.end_headers()
                with path.open('rb') as f:
                    while chunk:=f.read(65536):handler.wfile.write(chunk)
                return
        if handler.command=='POST' and route in ('/api/learning/add','/api/learning/delete'):
            if not handler.headers.get('Content-Type','').startswith('application/json'):
                return handler.reply(415,{'error':'Yêu cầu JSON.'})
            size=int(handler.headers.get('Content-Length',0))
            if not 0<size<17*1024*1024:return handler.reply(413,{'error':'Tệp quá lớn.'})
            payload=json.loads(handler.rfile.read(size))
            if route.endswith('/add'):return handler.reply(201,{'item':add(payload)})
            if not isinstance(payload,dict):raise ValueError('Dữ liệu không hợp lệ.')
            remove(payload.get('id'));return handler.reply(200,{'ok':True})
        return handler.reply(404,{'error':'API không tồn tại.'})
    except (ValueError,TypeError,UnicodeDecodeError) as error:return handler.reply(400,{'error':str(error)})
    except (BrokenPipeError,ConnectionResetError):return
    except OSError:return handler.reply(500,{'error':'Không đọc/ghi được thư mục Gallery.'})
