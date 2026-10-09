import {spawn,type ChildProcess} from 'node:child_process';
import path from 'node:path';
/** RISK: native quiet-mode probe controls visibility. Check foreground/owner, not every transparent window.
 * Keep it separate from WindowEdges, which must enumerate normal background support windows.
 */
export const fullscreenProbeScript=String.raw`$ErrorActionPreference='Stop';
Add-Type -TypeDefinition 'using System;
using System.Runtime.InteropServices;
using System.Text;
public class FsProbe {
 [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr c);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr h,uint f);
 [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr h,ref MONITORINFO i);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO {public int cbSize;public RECT Monitor;public RECT Work;public uint Flags;}
 public static bool IsExternalFullscreen(uint ownerProcessId) {
  IntPtr h=GetForegroundWindow();
  if(h==IntPtr.Zero || !IsWindowVisible(h) || IsIconic(h)) return false;
  uint windowProcessId=0;GetWindowThreadProcessId(h,out windowProcessId);
  if(windowProcessId==ownerProcessId) return false;
  StringBuilder name=new StringBuilder(256);GetClassName(h,name,256);string cls=name.ToString();
  if(cls=="Progman" || cls=="WorkerW" || cls=="Shell_TrayWnd" || cls=="Shell_SecondaryTrayWnd")return false;
  RECT r;if(!GetWindowRect(h,out r))return false;
  MONITORINFO m=new MONITORINFO();m.cbSize=Marshal.SizeOf(typeof(MONITORINFO));
  if(!GetMonitorInfo(MonitorFromWindow(h,2),ref m))return false;
  return r.Left<=m.Monitor.Left+2 && r.Top<=m.Monitor.Top+2 && r.Right>=m.Monitor.Right-2 && r.Bottom>=m.Monitor.Bottom-2;
 }
}';
[void][FsProbe]::SetProcessDpiAwarenessContext([IntPtr](-4));
while($true){if([FsProbe]::IsExternalFullscreen([uint32]$env:AMIYA_OWNER)){'1'}else{'0'};Start-Sleep -Milliseconds 1000}
`;
export class FullscreenWatcher {
 child:ChildProcess|null=null;fullscreen=false;
 constructor(private onChange:(fullscreen:boolean)=>void){}
 start(){
  if(this.child||process.platform!=='win32')return;
  const child=spawn(path.join(process.env.WINDIR||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(fullscreenProbeScript,'utf16le').toString('base64')],{windowsHide:true,env:{...process.env,AMIYA_OWNER:String(process.pid)}});
  this.child=child;let data='';
  child.stdout?.on('data',b=>{if(this.child!==child)return;data+=b;const lines=data.split(/\r?\n/);data=lines.pop()||'';for(const line of lines){if(!['0','1'].includes(line.trim()))continue;const next=line.trim()==='1';if(next!==this.fullscreen){this.fullscreen=next;this.onChange(next);}}});
  // An exited helper cannot strand hidden pets; ignore late events from a replaced helper.
  const finish=()=>{if(this.child!==child)return;this.child=null;if(this.fullscreen){this.fullscreen=false;this.onChange(false);}};
  child.on('error',finish);child.on('exit',finish);
 }
 stop(){const child=this.child;this.child=null;child?.kill();if(this.fullscreen){this.fullscreen=false;this.onChange(false);}}
}
