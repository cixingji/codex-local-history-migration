# 一键入口

普通用户只需要使用这里的三个 `.cmd` 文件：

1. 源电脑运行 `Export-Codex-History.cmd`。
2. 目标电脑运行 `Backup-Codex-Target-Before-Merge.cmd`。
3. 将导出包复制到目标电脑后，运行导出包里的 `Import-Codex-History-To-OpenAI.cmd`。

启动器会自动定位上一级的 `02-scripts`，目录名使用 ASCII，避免 Windows 代码页导致路径乱码。
