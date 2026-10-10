# Plus 版：直接下载使用（Windows x64）

**普通用户不用下载源码，不用安装 Node.js/npm。点击下面的 EXE 下载，双击即可。**

## 首选：0.3.1 EXE

[⬇ 下载 Plus 版 0.3.1 EXE](https://github.com/Mizusamada/TerraDeskMatePlus/releases/download/v0.3.1-plus/TerraDeskMatePlus-OneClick-Setup-0.3.1.exe)

全部角色基础资源、内置语音环境，不附独立训练音色权重。

这是**联网安装器**，一个小 EXE 自动下载完整资源、核对 SHA256、安装并更新到 0.3.1。需要能够访问 GitHub 的网络，不需要自己下载 BIN 或手动打更新补丁；它不是内含全部资源的离线单文件包。若下载失败会报错，可重新运行，不会把缺资源当成功。

首次需下载约 7.68 GB；请留出安装内容与临时下载都需要的磁盘空间。

[下载 SHA256 校验清单](https://github.com/Mizusamada/TerraDeskMatePlus/releases/download/v0.3.1-plus/DIRECT-DOWNLOAD-SHA256.json)。

## 三步开始

1. 下载上面的 EXE，双击按向导完成。
2. 打开软件控制中心。启动不会自动生成桌宠，点击“显示”才出场。
3. 模型、动作、原声等基础功能可以使用；AI 对话需填写自己的服务配置/密钥。ASR、外部语音推理及训练按所选版本另行配置。独立角色权重缺失时不能宣称其AI音色已可用。

## 下载并导入角色

[打开按角色分类的下载目录](角色下载目录.md)。下载需要的角色基础包 → 解压 → 控制中心“下载管理” → “导入角色文件夹 · 自动配置” → 选择含 manifest.json 的角色文件夹。软件导入后自动选择对应角色。语音权重需要另外下载导入，不能把基础包当训练权重。

## 离线/旧版完整包

[完整离线附件与已有便携分卷](https://github.com/Mizusamada/TerraDeskMatePlus/releases/tag/v0.3.0-plus)。离线安装时把安装 EXE 与全部同名 BIN 下载到同一目录；已有 7z 分卷必须下载所有编号再解压。历史完整包是 0.3.0，要到 0.3.1 需按更新说明应用最新更新 ZIP。优先使用本页首选入口，避免手动操作。

[全部最新发布附件](https://github.com/Mizusamada/TerraDeskMatePlus/releases/tag/v0.3.1-plus) · [详细使用说明](../docs/使用说明书/00-目录.md)

安装器尚未代码签名，Windows可能显示未知发布者。核对本仓库的下载来源和 SHA256；不要求关闭安全软件。没有将云端服务、其他物理电脑或所有角色音色标为已验证。
