import { spawn,type ChildProcess } from 'node:child_process';
import path from 'node:path';
import type { Rect } from './physics.js';
export class WindowEdges {
  child:ChildProcess|null=null;edges:Rect[]=[];
  start(){if(this.child||process.platform!=='win32')return;
    const script=String.raw`$ErrorActionPreference='Stop'; Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; using System.Text; public class PetWindows { [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c); public delegate bool EnumProc(IntPtr h,IntPtr l); [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;} [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc c,IntPtr l); [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h); [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h); [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p); [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder b,int n); }'; [void][PetWindows]::SetProcessDpiAwarenessContext([IntPtr](-4));
while($true){$list=[Collections.Generic.List[object]]::new(); [PetWindows]::EnumWindows({param($h,$l)
 if([PetWindows]::IsWindowVisible($h) -and -not [PetWindows]::IsIconic($h)){
  [uint32]$pidOwner=0;[void][PetWindows]::GetWindowThreadProcessId($h,[ref]$pidOwner);
  $b=[Text.StringBuilder]::new(256);[void][PetWindows]::GetClassName($h,$b,256);
  if($pidOwner -ne [uint32]$env:AMIYA_OWNER -and $b.ToString() -notmatch '^(Progman|WorkerW|Shell_TrayWnd|Shell_SecondaryTrayWnd)$'){
   $r=[PetWindows+RECT]::new();[void][PetWindows]::GetWindowRect($h,[ref]$r);if($r.Right-$r.Left -gt 160 -and $r.Bottom-$r.Top -gt 100){$list.Add(@{x=$r.Left;y=$r.Top;width=$r.Right-$r.Left;height=$r.Bottom-$r.Top})}
  }
 };return $true
},[IntPtr]::Zero)|Out-Null; ConvertTo-Json -InputObject @($list.ToArray()) -Compress -Depth 3; Start-Sleep -Milliseconds 1500}`;
    this.child=spawn(path.join(process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,AMIYA_OWNER:String(process.pid)}});
    let data='';this.child.stdout?.on('data',b=>{data+=b;const lines=data.split(/\r?\n/);data=lines.pop()||'';for(const line of lines){try{const edges=JSON.parse(line);if(Array.isArray(edges))this.edges=edges.filter(e=>['x','y','width','height'].every(k=>Number.isFinite(e[k])));}catch{}}});
    this.child.on('error',()=>this.stop());this.child.on('exit',()=>{this.child=null;this.edges=[];});
  }
  stop(){this.child?.kill();this.child=null;this.edges=[];}
}
