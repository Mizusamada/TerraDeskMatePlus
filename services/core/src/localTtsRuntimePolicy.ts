// Process construction policy is testable without importing huge checkpoints or launching user services.
export function localTtsThreadEnvironment(device:string,env:Record<string,string|undefined>){
 // Checkpoint loading runs on CPU even for CUDA inference. Default to one native
 // thread to avoid the verified Windows cold-load stall, while retaining explicit
 // environment overrides for users who have profiled their own machine.
 return {OMP_NUM_THREADS:device==='cpu'?'1':env.OMP_NUM_THREADS||'1',MKL_NUM_THREADS:device==='cpu'?'1':env.MKL_NUM_THREADS||'1'};
}
