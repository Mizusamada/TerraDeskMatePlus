"""Run the installed SoVITS optimizer on one CUDA device without Windows gloo/DDP.
No model/optimizer/epoch changes or source edits; a one-device wrapper only provides
.module used by official checkpointing and avoids an unnecessary collective backend.
"""
import argparse, importlib.util, pathlib, sys

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--install',required=True);parser.add_argument('--config',required=True);a=parser.parse_args();install=pathlib.Path(a.install)
    sys.path.insert(0,str(install/'GPT_SoVITS'));sys.path.insert(0,str(install));sys.argv=['s2_train.py','-c',a.config]
    spec=importlib.util.spec_from_file_location('terra_official_sovits_train',install/'GPT_SoVITS/s2_train.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
    import torch
    class SingleDeviceModule(torch.nn.Module):
        def __init__(self,module,**kwargs):super().__init__();self.module=module
        def forward(self,*args,**kwargs):return self.module(*args,**kwargs)
    m.DDP=SingleDeviceModule
    m.dist.init_process_group=lambda **kwargs: None
    # This official sampler is already passed rank=0,num_replicas=1; no distributed group is needed.
    m.run(0,1,m.hps)
if __name__=='__main__':main()
