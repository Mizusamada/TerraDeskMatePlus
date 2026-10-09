"""Sequential all-role queue with explicit transcription provenance and resumable status.
Only locally bundled recordings are read; Japanese recordings never receive Chinese
translations as fake transcripts. Local ASR is provisional and human validation stays pending.
"""
import argparse,hashlib,json,os,pathlib,subprocess,sys,time

def save(file,obj):
    file.parent.mkdir(parents=True,exist_ok=True);tmp=file.with_suffix('.tmp');tmp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8');tmp.replace(file)

def main():
    p=argparse.ArgumentParser();p.add_argument('--request',required=True);a=p.parse_args();r=json.loads(pathlib.Path(a.request).read_text(encoding='utf-8-sig'));root=pathlib.Path(r['assetsRoot']).resolve();out=pathlib.Path(r['outputDir']).resolve();install=pathlib.Path(r['installPath']).resolve();asr_path=pathlib.Path(r['asrModelPath']);state_file=out/'batch-status.json'
    if not (root/'干员语音').is_dir() or not asr_path.is_dir():raise ValueError('Bundled recordings or local ASR model missing; no automatic downloads')
    from faster_whisper import WhisperModel
    model=None;results=[];roles=sorted([d for d in (root/'干员语音').iterdir() if d.is_dir()],key=lambda d:(d.name!='Amiya',d.name))
    for folder in roles:
        role=folder.name;slug='role-'+hashlib.sha256(role.encode()).hexdigest()[:16];role_out=out/slug;role_out.mkdir(parents=True,exist_ok=True);samples=[]
        previous=role_out/'job-status.json'
        if previous.exists() and json.loads(previous.read_text(encoding='utf-8'))['status']=='trained_unverified':
            results.append({'roleId':role,'status':'trained_unverified','outputDir':str(role_out)});continue
        if role=='Amiya' and r.get('pilotDir'):
            pilot=pathlib.Path(r['pilotDir'])/'job-status.json'
            if pilot.exists() and json.loads(pilot.read_text(encoding='utf-8')).get('status')=='trained_unverified':
                results.append({'roleId':role,'status':'trained_unverified','outputDir':str(pilot.parent)});continue
        evidence={'status':'running','currentRole':role,'stage':'transcription','totalRoles':len(roles),'roles':results,'humanValidation':'not_run'};save(state_file,evidence)
        lines=(folder/'语音列表.txt').read_text(encoding='utf-8-sig').splitlines() if (folder/'语音列表.txt').exists() else []
        chinese={line.split('\t')[0]:' '.join(line.split('\t')[2:]) for line in lines if line.startswith('cn_') and len(line.split('\t'))>=3}
        transcript_file=role_out/'transcripts.json'
        if transcript_file.exists():samples=json.loads(transcript_file.read_text(encoding='utf-8'))
        else:
            for audio in sorted(folder.glob('*.mp3')):
                zh=folder/'zh'/audio.name
                if zh.exists() and chinese.get(audio.name):samples.append({'audioPath':str(zh),'text':chinese[audio.name].replace('|',' '),'language':'zh','transcriptSource':'bundled_original_text'});continue
                if model is None:model=WhisperModel(str(asr_path),device='cpu',compute_type='int8',cpu_threads=8,num_workers=1,local_files_only=True)
                segments,info=model.transcribe(str(audio),language='ja',beam_size=3,vad_filter=True,condition_on_previous_text=False)
                segments=list(segments);text=''.join(s.text for s in segments).strip().replace('|',' ').replace('\n',' ')
                confidence=sum(s.avg_logprob for s in segments)/max(1,len(segments))
                if text and confidence>-1.2:samples.append({'audioPath':str(audio),'text':text,'language':'ja','transcriptSource':'local_whisper_small_unreviewed','avgLogProbability':confidence})
            save(transcript_file,samples)
        if len(samples)<8:
            results.append({'roleId':role,'status':'blocked','reason':'Less than 8 usable aligned/local-ASR recordings','outputDir':str(role_out)});continue
        request={'installPath':str(install),'outputDir':str(role_out),'roleId':role,'samples':samples,'baseGptModelPath':r['baseGptModelPath'],'baseSovitsModelPath':r['baseSovitsModelPath'],'gptEpochs':4,'sovitsEpochs':8,'batchSize':2,'stageTimeoutSeconds':1800};request_file=role_out/'request.json';save(request_file,request)
        evidence['stage']='training';save(state_file,evidence);print('BATCH_ROLE '+role,flush=True)
        with (role_out/'queue-runner.log').open('w',encoding='utf-8') as log:
            job=subprocess.Popen([sys.executable,str(pathlib.Path(__file__).with_name('train-role.py')),'--request',str(request_file)],stdout=log,stderr=subprocess.STDOUT,env={**os.environ,'PYTHONUTF8':'1'})
            try:code=job.wait(timeout=9000)
            except subprocess.TimeoutExpired:
                subprocess.run(['taskkill','/PID',str(job.pid),'/T','/F'],capture_output=True);code=-1
        result=json.loads(previous.read_text(encoding='utf-8')) if previous.exists() else {'status':'failed','error':'Training runner did not create status'}
        results.append({'roleId':role,'status':result['status'],'outputDir':str(role_out),'exitCode':code})
        # A shared/runtime failure must stop the queue, rather than spend hours repeating the same failure across 41 characters.
        if code:save(state_file,{**evidence,'status':'failed','roles':results,'error':result.get('error','role training failed')});return 1
        save(state_file,{**evidence,'roles':results})
    save(state_file,{'status':'completed','totalRoles':len(roles),'roles':results,'humanValidation':'not_run','allWeightsVerified':False});return 0
if __name__=='__main__':sys.exit(main())
