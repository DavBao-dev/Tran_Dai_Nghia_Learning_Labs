"""Validate ZIP bytes and execute all sample notebooks through a real Jupyter server kernel."""
import asyncio,importlib.util,json,os,socket,subprocess,sys,tempfile,time,zipfile
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from jupyter_client import BlockingKernelClient
if os.name=='nt':asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
root=Path(__file__).resolve().parents[1]
work=root/'.cache/jupyter-kits'
spec=importlib.util.spec_from_file_location('launcher',root/'dist/jupyter-kit/start-jupyterlab.py')
launcher=importlib.util.module_from_spec(spec);spec.loader.exec_module(launcher)
with tempfile.TemporaryDirectory(prefix='tdn-jupyter-test-',ignore_cleanup_errors=True) as temp:
    temp=Path(temp)
    for file in work.glob('*.zip'):
        with zipfile.ZipFile(file) as z:
            assert z.testzip() is None
            assert all(not Path(p).is_absolute() and '..' not in Path(p).parts for p in z.namelist())
            z.extractall(temp/file.stem)
    project=temp/'sentiment'
    with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
    command,env=launcher.launch_spec(project,sys.executable,port,True)
    env['JUPYTER_RUNTIME_DIR']=str(temp/'runtime');env['JUPYTER_CONFIG_DIR']=str(temp/'config')
    def request(path,payload=None,auth=True,method=None):
        headers={'Authorization':'token '+env['JUPYTER_TOKEN']} if auth else {}
        if payload is not None:headers['Content-Type']='application/json'
        req=Request(f'http://127.0.0.1:{port}'+path,headers=headers,data=json.dumps(payload).encode() if payload is not None else None,method=method)
        with urlopen(req,timeout=5) as r:return r.status,r.read()
    with open(temp/'server.log','w',encoding='utf-8') as log:
        child=subprocess.Popen(command,cwd=project,env=env,stdout=log,stderr=log,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        try:
            for _ in range(60):
                try:
                    if request('/api/status')[0]==200:break
                except Exception:time.sleep(.5)
            else:raise RuntimeError('Jupyter did not start; check local test dependencies.')
            try:request('/api/contents',auth=False);raise AssertionError('Anonymous access was allowed')
            except HTTPError as e:assert e.code in (401,403)
            assert request('/lab')[0]==200
            assert json.loads(request('/api/contents/notebook.ipynb')[1])['type']=='notebook'
            kernel=json.loads(request('/api/kernels',{'name':'python3'})[1]);kid=kernel['id']
            connection=temp/'runtime'/('kernel-'+kid+'.json')
            for _ in range(30):
                if connection.exists():break
                time.sleep(.2)
            client=BlockingKernelClient(connection_file=str(connection));client.load_connection_file();client.hb_channel.time_to_dead=10;client.start_channels();client.wait_for_ready(timeout=45)
            def execute(code):
                result=client.execute_interactive(code,timeout=60,output_hook=lambda msg:None)
                assert result['content']['status']=='ok',result['content'].get('evalue')
            execute('assert 6*7==42\nimport os\nassert os.getcwd()=='+repr(str(project)))
            for name in ['sentiment','spam','flowers','housing','forecast']:
                folder=temp/name
                assert folder.exists(),name
                notebook=json.loads((folder/'notebook.ipynb').read_text(encoding='utf-8'))
                code='import os\nos.chdir('+repr(str(folder))+')\n'+ '\n'.join(''.join(c['source']) if isinstance(c['source'],list) else c['source'] for c in notebook['cells'] if c['cell_type']=='code')
                execute(code)
                assert (folder/'submission.csv').exists()
                print('PASS real JupyterLab kernel:',name,'-> submission.csv',flush=True)
            client.stop_channels();request('/api/kernels/'+kid,method='DELETE')
            print('PASS: real JupyterLab HTTP, token authentication, notebook, working directory and baseline execution.',flush=True)
        finally:
            if 'client' in locals():client.stop_channels()
            try:request('/api/shutdown',{},method='POST')
            except Exception:pass
            try:child.wait(timeout=20)
            except subprocess.TimeoutExpired:child.terminate();child.wait(timeout=10)
