param([string]$Role='',[switch]$IncludeVoiceWeights,[switch]$IncludeSpeechRuntime)
# Plus restores the shared base resources/runtime only; trained voice weights are excluded by design.
if ($IncludeVoiceWeights) { throw 'Plus不恢复41套独立训练权重，请使用参考推理' }
$ErrorActionPreference='Stop'
$root=$PSScriptRoot
$edition=(Get-Content -LiteralPath (Join-Path $root 'distribution.json') -Raw | ConvertFrom-Json).variant
$repo=if($edition -eq 'light'){'Mizusamada/TerraDeskMateLight'}else{'Mizusamada/TerraDeskMate'}
$tag='v0.3.0'
$catalogFile=Join-Path $root '发布资源\下载目录.json'
if(-not(Test-Path -LiteralPath $catalogFile)){New-Item -ItemType Directory -Path (Split-Path $catalogFile) -Force | Out-Null;Invoke-WebRequest -Uri "https://github.com/$repo/releases/download/$tag/resource-catalog.json" -OutFile $catalogFile}
$catalog=Get-Content -LiteralPath $catalogFile -Raw | ConvertFrom-Json
$downloads=Join-Path $root '.downloads';New-Item -ItemType Directory -Path $downloads -Force | Out-Null
function Fetch([object]$item,[string]$owner=$repo){$file=Join-Path $downloads $item.file;if(-not(Test-Path -LiteralPath $file)-or (Get-Item -LiteralPath $file).Length-ne $item.bytes){$url=if($item.url){$item.url}else{"https://github.com/$owner/releases/download/$tag/$($item.file)"};Invoke-WebRequest -Uri $url -OutFile $file};if((Get-Item -LiteralPath $file).Length-ne $item.bytes){throw "下载不完整: $($item.file)"};return $file}
function Extract([object[]]$items,[string]$destination){if(-not $items.Count){return};$paths=@($items|Sort-Object file|ForEach-Object{Fetch $_});if($paths.Count-eq 1-and $paths[0].EndsWith('.zip')){$archive=$paths[0]}else{$archive=Join-Path $downloads (($items[0].file -replace '\.\d+$',''));$dest=[System.IO.File]::Create($archive);try{foreach($p in $paths){$input=[System.IO.File]::OpenRead($p);try{$input.CopyTo($dest)}finally{$input.Dispose()}}}finally{$dest.Dispose()}};New-Item -ItemType Directory -Path $destination -Force|Out-Null;Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force}
$assets=Join-Path $root 'assets\builtin'
Extract @($catalog.sourceAssets|Where-Object{$_.kind-eq 'source-assets'}) $assets
if($Role){$entry=$catalog.basePackages|Where-Object{$_.roleId-eq $Role}|Select-Object -First 1;if(-not $entry){throw '角色未列入基础包目录；全量版已自带所有基础资源'};$file=Fetch $entry;$destination=Join-Path $root ('角色基础包\'+$entry.roleId);Expand-Archive -LiteralPath $file -DestinationPath $destination -Force;Write-Output "基础文件夹已取得: $destination，软件内选择含manifest.json的目录导入。"}
if($IncludeVoiceWeights){if($edition-eq 'full'){Extract @($catalog.sourceAssets|Where-Object{$_.kind-eq 'weight-metadata'}) $assets};$entries=if($Role){@($catalog.voicePackages|Where-Object{$_.roleId-eq $Role})}else{@($catalog.voicePackages)};if(-not $entries.Count){throw '该角色当前没有提供独立权重；不影响基础包和原声'};foreach($e in $entries){$file=Fetch $e 'Mizusamada/TerraDeskMateLight';$destination=Join-Path $root ('语音权重包\'+$e.roleId);Expand-Archive -LiteralPath $file -DestinationPath $destination -Force;if($edition-eq 'full'){foreach($pair in @(@('gpt.ckpt',$e.gpt),@('sovits.pth',$e.sovits))){$target=Join-Path $assets $pair[1];New-Item -ItemType Directory -Path (Split-Path $target)-Force|Out-Null;Copy-Item -LiteralPath (Join-Path $destination $pair[0])-Destination $target -Force}}}}
if($IncludeSpeechRuntime){if($edition-ne 'full'){throw '轻量源码不附运行环境，请按手册另装共用GPT-SoVITS'};Extract @($catalog.sharedRuntime) (Join-Path $root 'speech-runtime')}
Write-Output '资源取得完毕。源码用户运行npm ci、npm run build；普通用户直接下载Release安装程序。'

