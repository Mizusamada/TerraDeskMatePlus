"""Run the installed official v2 scripts, keeping every output in a role-owned directory.
This is real optimization, not reference inference. Exit status and actual checkpoints
are audited separately from human timbre validation; no cloud/GPU rental is used.
"""
import argparse, json, os, pathlib, subprocess, sys, time, hashlib

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)

def main():
    args=argparse.ArgumentParser();args.add_argument('--request',required=True);request=json.loads(pathlib.Path(args.parse_args().request).read_text(encoding='utf-8-sig'))
    install=pathlib.Path(request['installPath']).resolve();output=pathlib.Path(request['outputDir']).resolve();output.mkdir(parents=True,exist_ok=True)
    role=request['roleId'];experiment='role-'+hashlib.sha256(role.encode('utf-8')).hexdigest()[:16];samples=request['samples'];python=sys.executable;status=output/'job-status.json';started=time.time()
    # Non-network mode makes missing pretrained dependencies a visible error, not an unbounded background download.
    env=dict(os.environ);env.update({'PYTHONIOENCODING':'utf-8','PYTHONUTF8':'1','HF_HUB_OFFLINE':'1','TRANSFORMERS_OFFLINE':'1','USE_LIBUV':'0','version':'v2','is_half':'True','_CUDA_VISIBLE_DEVICES':'0','i_part':'0','all_parts':'1','opt_dir':str(output/'features'),'exp_name':experiment,'bert_pretrained_dir':str(install/'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large'),'cnhubert_base_dir':str(install/'GPT_SoVITS/pretrained_models/chinese-hubert-base'),'pretrained_s2G':request['baseSovitsModelPath'],'s2config_path':str(install/'GPT_SoVITS/configs/s2.json'),'hz':'25hz'})
    # Installed, user-supplied official weights are trusted; arbitrary downloaded checkpoints are never accepted here.
    env['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD']='1'
    env['PATH']=str(install/'env/Library/bin')+os.pathsep+env.get('PATH','')
    exp=output/'features';exp.mkdir(exist_ok=True);audio=output/'audio';audio.mkdir(exist_ok=True);rows=[]
    import soundfile as sf
    import numpy as np
    import yaml
    import torch
    if not torch.cuda.is_available():raise RuntimeError('本机未检测到CUDA；为避免无限CPU训练，本任务未启动')
    required=[env['bert_pretrained_dir'],env['cnhubert_base_dir'],request['baseGptModelPath'],request['baseSovitsModelPath'],str(install/'GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s2D2333k.pth')]
    for file in required:
        if not pathlib.Path(file).exists():raise FileNotFoundError('Missing local dependency: '+file)
    # Normalize copies only. Input MP3s and D:\ak never change; hold-out rows remain outside the optimization data.
    import librosa
    for i,row in enumerate(samples):
        if row['language'] not in ('zh','ja','en','ko','yue') or not row['text'].strip() or any(x in row['text'] for x in '|\r\n'):raise ValueError('Invalid role transcription')
        data,sr=librosa.load(row['audioPath'],sr=32000,mono=True)
        if len(data)<sr or len(data)>54*sr:continue
        target=audio/(str(i).zfill(4)+'.wav');sf.write(str(target),data,32000,subtype='PCM_16')
        rows.append(str(target)+'|'+experiment+'|'+row['language'].upper()+'|'+row['text'].strip())
    if len(rows)<8:raise ValueError('Fewer than 8 valid aligned original recordings; refusing poor-data training')
    holdout=[rows[0],rows[-1]];train=rows[1:-1];dataset=output/'dataset.list';dataset.write_text('\n'.join(train),encoding='utf-8');(output/'holdout.list').write_text('\n'.join(holdout),encoding='utf-8');env['inp_text']=str(dataset);env['inp_wav_dir']=str(audio)
    epochs_gpt=int(request.get('gptEpochs',4));epochs_sovits=int(request.get('sovitsEpochs',8));batch=int(request.get('batchSize',2));stage_timeout=int(request.get('stageTimeoutSeconds',1800))
    if not (1<=epochs_gpt<=30 and 1<=epochs_sovits<=40 and 1<=batch<=8 and 60<=stage_timeout<=7200):raise ValueError('Training resource limits out of bounds')
    gpt=yaml.safe_load((install/'GPT_SoVITS/configs/s1longer-v2.yaml').read_text());gpt.update({'pretrained_s1':request['baseGptModelPath'],'train_semantic_path':str(exp/'6-name2semantic.tsv'),'train_phoneme_path':str(exp/'2-name2text.txt'),'output_dir':str(output/'gpt-logs')});gpt['train'].update({'batch_size':batch,'epochs':epochs_gpt,'save_every_n_epoch':epochs_gpt,'if_save_every_weights':True,'if_save_latest':True,'if_dpo':False,'half_weights_save_dir':str(output/'gpt-weights'),'exp_name':experiment});gpt['data']['num_workers']=1
    sovits=json.loads((install/'GPT_SoVITS/configs/s2.json').read_text());sovits['train'].update({'batch_size':batch,'epochs':epochs_sovits,'pretrained_s2G':request['baseSovitsModelPath'],'pretrained_s2D':str(install/'GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s2D2333k.pth'),'if_save_latest':True,'if_save_every_weights':True,'save_every_epoch':epochs_sovits,'gpu_numbers':'0','grad_ckpt':True,'lora_rank':'32'});sovits['model']['version']='v2';sovits['data']['exp_dir']=str(exp);sovits['s2_ckpt_dir']=str(output/'sovits-logs');sovits['save_weight_dir']=str(output/'sovits-weights');sovits['name']=experiment;sovits['version']='v2'
    for d in ('gpt-weights','sovits-weights','sovits-logs'): (output/d).mkdir(exist_ok=True)
    (exp/'logs_s2_v2').mkdir(exist_ok=True)
    gpt_file=output/'gpt.yaml';gpt_file.write_text(yaml.safe_dump(gpt,allow_unicode=True),encoding='utf-8');sovits_file=output/'sovits.json';write_json(sovits_file,sovits)
    stages=[('text','GPT_SoVITS/prepare_datasets/1-get-text.py',[]),('hubert','GPT_SoVITS/prepare_datasets/2-get-hubert-wav32k.py',[]),('semantic','GPT_SoVITS/prepare_datasets/3-get-semantic.py',[]),('gpt',str(pathlib.Path(__file__).with_name('train-gpt-single-gpu.py').resolve()),['--install',str(install),'--config',str(gpt_file)]),('sovits',str(pathlib.Path(__file__).with_name('train-sovits-single-gpu.py').resolve()),['--install',str(install),'--config',str(sovits_file)])]
    evidence={'roleId':role,'status':'running','startedAt':time.strftime('%Y-%m-%dT%H:%M:%S'),'samples':len(train),'holdout':len(holdout),'device':torch.cuda.get_device_name(0),'epochs':{'gpt':epochs_gpt,'sovits':epochs_sovits},'steps':[],'humanValidation':'not_run','realOptimization':True}
    try:
        for stage,script,extra in stages:
            evidence['stage']=stage;write_json(status,evidence);print('TRAIN_STAGE '+stage,flush=True)
            log=output/(stage+'.log');begin=time.time()
            with log.open('w',encoding='utf-8') as handle:
                process=subprocess.Popen([python,'-s',str(install/script),*extra],cwd=str(install),env=env,stdout=handle,stderr=subprocess.STDOUT)
                try:code=process.wait(timeout=stage_timeout)
                except subprocess.TimeoutExpired:
                    subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True);raise TimeoutError(stage+' timeout; process tree stopped')
            evidence['steps'].append({'stage':stage,'exitCode':code,'seconds':round(time.time()-begin,1),'logPath':str(log)})
            if code:raise RuntimeError(stage+' failed; see role log')
            if stage=='text':
                text=(exp/'2-name2text-0.txt').read_text(encoding='utf-8');(exp/'2-name2text.txt').write_text(text,encoding='utf-8')
                if len(text.splitlines())<8:raise RuntimeError('Official text preprocessing silently rejected most samples')
            if stage=='hubert' and len(list((exp/'4-cnhubert').glob('*.pt')))<8:raise RuntimeError('HuBERT did not produce enough real audio features')
            if stage=='semantic':
                text=(exp/'6-name2semantic-0.tsv').read_text(encoding='utf-8');(exp/'6-name2semantic.tsv').write_text('item_name\tsemantic_audio\n'+text,encoding='utf-8')
                if len(text.splitlines())<8:raise RuntimeError('Semantic extraction produced too few rows')
        gpts=list((output/'gpt-weights').glob('*.ckpt'));sovs=list((output/'sovits-weights').glob('*.pth'))
        if not gpts or not sovs:raise RuntimeError('Training finished without both exported model weights')
        gp=max(gpts,key=lambda p:p.stat().st_mtime);sv=max(sovs,key=lambda p:p.stat().st_mtime)
        # Weight structural check does not assert voice similarity. Further synthesis and human listening remain required.
        for file in (gp,sv):
            ckpt=torch.load(str(file),map_location='cpu',weights_only=False)
            if not isinstance(ckpt,dict) or not ckpt.get('weight'):raise ValueError('Export is not a GPT-SoVITS inference checkpoint')
            del ckpt
        evidence.update({'status':'trained_unverified','gptModelPath':str(gp),'sovitsModelPath':str(sv),'weightHashes':{gp.name:hashlib.sha256(gp.read_bytes()).hexdigest(),sv.name:hashlib.sha256(sv.read_bytes()).hexdigest()}})
    except BaseException as e:
        evidence.update({'status':'failed','error':str(e)});write_json(status,evidence);raise
    finally:
        evidence['seconds']=round(time.time()-started,1);write_json(status,evidence)
    # Successful inference exports make optimizer snapshots disposable. Preserve samples/features,
    # both final models, hashes and logs; failed/running jobs keep checkpoints for recovery.
    # Removing only this job's generated optimizer files avoids ~1-2GiB per role growing on C:.
    if not request.get('keepResumeCheckpoints',False):
        import shutil
        kept=[pathlib.Path(evidence['gptModelPath']).resolve(),pathlib.Path(evidence['sovitsModelPath']).resolve()]
        for cache in [output/'gpt-logs'/'ckpt',exp/'logs_s2_v2']:
            resolved=cache.resolve()
            if not resolved.is_relative_to(output) or cache.is_symlink() or any(file.is_relative_to(resolved) for file in kept):raise ValueError('Unsafe generated-checkpoint cleanup target')
            if cache.exists():shutil.rmtree(cache)
        evidence['optimizerCheckpointsRetained']=False;write_json(status,evidence)
    print('TRAIN_RESULT '+json.dumps(evidence,ensure_ascii=False),flush=True)
if __name__=='__main__':main()
