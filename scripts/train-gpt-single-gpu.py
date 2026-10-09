"""Local single-GPU adapter; official sources/optimizers/checkpoint behavior stay intact.
Windows process-spawn imports must not rerun the training entrypoint in loader workers.
"""
import argparse, importlib.util, pathlib, sys

def main():
    args=argparse.ArgumentParser();args.add_argument('--install',required=True);args.add_argument('--config',required=True);a=args.parse_args()
    install=pathlib.Path(a.install);sys.path.insert(0,str(install/'GPT_SoVITS'));sys.path.insert(0,str(install))
    spec=importlib.util.spec_from_file_location('terra_official_gpt_train',install/'GPT_SoVITS/s1_train.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    OfficialTrainer=m.Trainer
    def single_gpu_trainer(**kwargs):
        kwargs['strategy']='auto';kwargs['devices']=1
        return OfficialTrainer(**kwargs)
    # Bucket ordering still comes from the official sampler; explicit single-GPU rank avoids an unnecessary gloo group.
    import AR.data.data_module as module
    OfficialSampler=module.DistributedBucketSampler
    def single_sampler(*args,**kwargs):
        kwargs.setdefault('num_replicas',1);kwargs.setdefault('rank',0)
        return OfficialSampler(*args,**kwargs)
    module.DistributedBucketSampler=single_sampler
    m.Trainer=single_gpu_trainer
    m.main(argparse.Namespace(config_file=a.config))
if __name__=='__main__':main()
