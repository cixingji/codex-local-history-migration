# Codex 本地会话备份、恢复与跨电脑合并指南

本文适用于 Windows Codex Desktop，目标包括：

1. 完整备份当前电脑的 `.codex`。
2. 在迁移失败时完整恢复。
3. 将一台电脑的会话合并到另一台电脑，并统一为官方 `openai` provider。
4. 说明本次问题、失败原因、最终解决方案及数据存储原理。

> 重要：执行备份、恢复、导出或导入前，必须完全退出 Codex Desktop 和 Codex++。

---

## 一、完整备份命令

### 1. 关闭 Codex 和 Codex++

打开外部 PowerShell，执行：

```powershell
Get-Process codex, codex-code-mode-host, codex-plus-plus, codex-plus-plus-manager -ErrorAction SilentlyContinue |
    Stop-Process -Force
```

### 2. 选择备份位置

建议备份到移动硬盘或其他磁盘，不要备份到原 `.codex` 目录内部。

下面以 `D:` 盘为例：

```powershell
$codexPath = "$env:USERPROFILE\.codex"
$backupPath = "D:\Codex-Full-Backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

检查源目录是否存在：

```powershell
Test-Path -LiteralPath $codexPath
```

应返回：

```text
True
```

### 3. 执行完整备份

```powershell
robocopy $codexPath $backupPath /E /COPY:DAT /R:1 /W:1 /XJ
```

参数含义：

- `/E`：复制全部子目录，包括空目录。
- `/COPY:DAT`：复制数据、属性和时间。
- `/R:1`：失败时只重试一次。
- `/W:1`：重试前等待一秒。
- `/XJ`：跳过目录联接，避免循环复制。

`robocopy` 返回代码 `0` 到 `7` 通常都不代表失败。

### 4. 验证完整备份

```powershell
Test-Path "$backupPath\sessions"
Test-Path "$backupPath\state_5.sqlite"
Test-Path "$backupPath\session_index.jsonl"
```

至少前两项应该返回 `True`。

统计备份中的活动会话：

```powershell
Get-ChildItem "$backupPath\sessions" -Recurse -File -Filter *.jsonl |
    Measure-Object
```

### 5. 哪些文件最重要

完整备份会复制整个 `.codex`，因此文件很多。聊天记录相关的核心内容是：

```text
.codex\sessions\
.codex\archived_sessions\
.codex\state_5.sqlite
.codex\state_5.sqlite-wal
.codex\state_5.sqlite-shm
.codex\session_index.jsonl
.codex\sqlite\codex-dev.db
.codex\sqlite\codex-dev.db-wal
.codex\sqlite\codex-dev.db-shm
```

完整备份还会包含配置、技能、插件、日志和缓存。它们不全是聊天记录，但保留完整备份最利于原机回滚。

---

## 二、恢复完整目录命令

本节只适用于恢复“目标电脑自己创建的完整备份”。

不要用源电脑的完整 `.codex` 备份覆盖目标电脑，否则可能同时覆盖：

```text
auth.json
config.toml
installation_id
插件配置
机器状态
```

### 1. 完全退出相关程序

```powershell
Get-Process codex, codex-code-mode-host, codex-plus-plus, codex-plus-plus-manager -ErrorAction SilentlyContinue |
    Stop-Process -Force
```

### 2. 设置路径

将 `$backupPath` 换成实际完整备份目录：

```powershell
$backupPath = "D:\Codex-Full-Backup-20260729-xxxxxx"
$codexPath = "$env:USERPROFILE\.codex"
$failedPath = "$env:USERPROFILE\.codex-failed-$(Get-Date -Format yyyyMMdd-HHmmss)"
```

### 3. 恢复前检查

```powershell
Test-Path "$backupPath\sessions"
Test-Path "$backupPath\state_5.sqlite"
```

两项都应返回 `True`。

确认即将操作的当前目录：

```powershell
Resolve-Path -LiteralPath $codexPath
Resolve-Path -LiteralPath $backupPath
```

### 4. 保留失败后的现场

不要直接把备份覆盖到现有 `.codex` 上。先将当前目录改名：

```powershell
Move-Item -LiteralPath $codexPath -Destination $failedPath
```

这样即使恢复结果不符合预期，迁移失败后的文件仍然保留在：

```text
C:\Users\当前用户名\.codex-failed-日期时间
```

### 5. 创建全新目录并恢复

```powershell
New-Item -ItemType Directory -Path $codexPath | Out-Null

robocopy $backupPath $codexPath /E /COPY:DAT /R:1 /W:1 /XJ
```

### 6. 验证恢复结果

```powershell
Test-Path "$codexPath\sessions"
Test-Path "$codexPath\state_5.sqlite"
Test-Path "$codexPath\session_index.jsonl"
```

启动 Codex，随机打开多条历史会话，检查：

- 标题是否正常。
- 用户和助手消息是否完整。
- 工具调用记录是否存在。
- 归档状态是否正常。
- provider 是否符合预期。

确认稳定运行几天后，才考虑删除 `.codex-failed-日期时间`。

---

## 三、跨电脑导出、覆盖与合并

### 1. 不要直接覆盖目标 `.codex`

跨电脑迁移时，不能把源电脑整个 `.codex` 直接覆盖到目标电脑。

正确原则是：

- 会话正文按会话 ID 合并。
- 目标电脑已有同 ID 会话时保留目标版本。
- 将源会话缺失的 `threads` 记录插入目标 `state_5.sqlite`。
- 合并 `session_index.jsonl`，不能整体覆盖。
- 修正跨电脑后的 `rollout_path`。
- 将任意 provider 统一为规范值 `openai`。

### 2. 使用迁移工具包

工具包：

[Codex-History-Migration-Toolkit.zip](./Codex-History-Migration-Toolkit.zip)

解压后包含：

```text
01-一键入口/Export-Codex-History.cmd
02-脚本实现/export-codex-history.js
01-一键入口/Import-Codex-History-To-OpenAI.cmd
02-脚本实现/import-codex-history-to-openai.js
```

四个文件必须放在同一目录。

### 3. 在源电脑导出

先退出 Codex/Codex++，然后双击：

```text
01-一键入口/Export-Codex-History.cmd
```

也可以从 PowerShell 执行：

```powershell
cmd /c "C:\迁移工具目录\01-一键入口\Export-Codex-History.cmd"
```

输入 `Y` 后，程序会：

1. 关闭 Codex 和 Codex++。
2. 对 `state_5.sqlite` 执行安全的 WAL checkpoint。
3. 导出 `sessions`。
4. 导出 `archived_sessions`。
5. 导出 `state_5.source.sqlite`。
6. 导出 `session_index.source.jsonl`。
7. 生成 SHA-256 校验文件。
8. 将目标电脑导入程序放入导出包。

桌面会生成：

```text
Codex-History-Export-日期时间
```

将整个文件夹复制到移动硬盘，不要只复制其中的 SQLite 文件。

### 4. 在目标电脑导入

导入前，建议先按“第一部分”创建目标电脑自己的完整备份。

把整个 `Codex-History-Export-日期时间` 文件夹复制到目标电脑，然后双击其中的：

```text
Import-Codex-History-To-OpenAI.cmd（导出包内置的导入入口）
```

也可以从 PowerShell 执行：

```powershell
cmd /c "D:\Codex-History-Export-日期时间\Import-Codex-History-To-OpenAI.cmd"
```

输入 `Y` 后，程序会自动：

1. 关闭 Codex 和 Codex++。
2. 验证导出包 SHA-256。
3. 在目标 `.codex\backups_state\cross-machine-import` 中创建导入前备份。
4. 按会话 ID 复制目标电脑缺失的 JSONL。
5. 保留目标电脑已有的同 ID 会话。
6. 合并 `session_index.jsonl`。
7. 向目标 `state_5.sqlite -> threads` 插入缺失记录。
8. 修正 `rollout_path` 为目标电脑的绝对路径。
9. 补充 `codex-dev.db -> local_thread_catalog`。
10. 将所有非 `openai` provider 统一为小写 `openai`。

此流程不依赖 Codex++ 的“立即修复历史会话”。

### 5. 冲突处理规则

如果源电脑和目标电脑存在相同会话 ID：

- 不覆盖目标电脑的会话正文。
- 保留目标电脑版本。
- 在输出中增加冲突计数。

如果导出文件损坏：

- SHA-256 校验失败。
- 导入会在修改目标数据之前停止。

如果导入失败：

- 保留目标电脑完整备份。
- 保留自动生成的精简备份。
- 按“第二部分”恢复目标电脑自己的完整备份。

### 6. 导入完成后的验证

启动官方 Codex，切换到官方 OpenAI provider。

统计目标电脑会话文件：

```powershell
Get-ChildItem "$env:USERPROFILE\.codex\sessions" -Recurse -File -Filter *.jsonl |
    Measure-Object
```

检查导入程序最终输出：

```text
New session files copied
New threads inserted into state_5.sqlite
Session files normalized to openai
New local catalog rows inserted
Session index entries after merge
Conflicting existing session IDs kept on target
Backup
```

随机抽查多条源电脑历史。不要只检查侧边栏数量，还要实际打开会话检查正文。

---

## 四、本次问题、失败原因与最终解决

### 1. 最初症状

Codex++ 的历史修复显示：

```text
修复 0 个会话文件
更新 0 行数据库索引
```

切换到官方 OpenAI provider 后，原来由其他 provider 创建的本地历史没有出现。

### 2. Codex 当前的数据层次

当前 Codex 并非只使用一个文件保存聊天。

#### 会话正文

```text
C:\Users\用户名\.codex\sessions\...\rollout-*.jsonl
```

每个 JSONL 保存一条完整会话，包括：

- 会话 ID。
- 用户消息。
- 助手回复。
- 工具调用和工具结果。
- 工作目录。
- 模型和 provider。
- 恢复会话需要的事件。

首行通常是 `session_meta`，其中包含：

```json
{
  "type": "session_meta",
  "payload": {
    "id": "会话ID",
    "model_provider": "某个provider"
  }
}
```

#### 官方主历史索引

```text
C:\Users\用户名\.codex\state_5.sqlite
```

核心表：

```text
threads
```

关键字段：

```text
id
rollout_path
title
cwd
model_provider
archived
created_at
updated_at
```

在本机诊断时，该表仍有约 `120` 条记录属于 `5_6`。这就是切换到官方 OpenAI 后无法找到这些历史的直接原因。

#### 桌面目录缓存

```text
C:\Users\用户名\.codex\sqlite\codex-dev.db
```

核心表：

```text
local_thread_catalog
```

它主要服务于桌面侧边栏、本地和远程主机目录聚合，不保存完整聊天正文。

#### 轻量标题索引

```text
C:\Users\用户名\.codex\session_index.jsonl
```

通常保存：

```text
会话 ID
标题
更新时间
```

跨电脑合并时必须按 ID 去重。

#### SQLite 临时事务文件

```text
state_5.sqlite-wal
state_5.sqlite-shm
codex-dev.db-wal
codex-dev.db-shm
```

Codex 运行时，最新修改可能仍在 WAL 中。因此迁移前必须退出 Codex，避免旧数据回写或数据库不一致。

### 3. 为什么第一次没有同步成功

#### 原因一：一开始误判了问题边界

最初将“同步到 OpenAI”误解为云端同步。实际诉求是将本地历史的 provider 归属改为官方 `openai`。

#### 原因二：第一版只修改了错误或不完整的层

第一版只处理了：

```text
JSONL 的 session_meta
codex-dev.db 的 local_thread_catalog
```

却遗漏了官方真正用于恢复和筛选历史的：

```text
state_5.sqlite -> threads.model_provider
```

因此文件虽然被修改，官方 Codex 主索引仍认为它们属于旧 provider。

#### 原因三：provider 大小写不规范

第一版写成：

```text
OpenAI
```

而官方已有正常记录使用的规范值是：

```text
openai
```

provider 是字符串标识，必须统一为小写 `openai`。

#### 原因四：PowerShell 预扫描跳过部分 JSONL

PowerShell `ConvertFrom-Json` 对部分大型会话元数据解析失败，误跳过了 `14` 个文件。

后续改为 Node.js 逐行解析 JSONL，避免 PowerShell 解析差异。

#### 原因五：Codex++ 版本与多数据库结构不兼容

当时使用的 Codex++ `1.2.41` 没有正确覆盖当前 Codex 的多数据库和目录索引结构，因此出现“操作完成但修改数为 0”。

#### 原因六：运行中的 Codex 可能覆盖修改

Codex 使用 SQLite WAL 模式。程序运行时直接修改数据库，可能遇到：

- 数据库锁。
- 修改未进入正确事务。
- WAL 中的旧数据重新写回主数据库。
- 侧边栏继续使用旧缓存。

所以所有迁移和恢复都要求先退出 Codex。

### 4. 最终解决方案

最终方案同时处理以下内容：

```text
JSONL session_meta.model_provider       -> openai
state_5.sqlite threads.model_provider   -> openai
codex-dev.db local_thread_catalog       -> openai
session_index.jsonl                     -> 按会话 ID 合并
threads.rollout_path                    -> 修改为目标电脑路径
```

跨电脑导入时还会：

- 按会话 ID 合并而不是覆盖目标数据。
- 向目标 `threads` 表插入缺失会话。
- 补充目标桌面目录索引。
- 对传输文件执行 SHA-256 校验。
- 修改前自动备份。
- 冲突时保留目标电脑版本。

### 5. 最终原理

三层职责可以概括为：

```text
rollout JSONL       保存真实聊天正文
state_5.sqlite      让官方 Codex 找到和恢复正文
codex-dev.db        让桌面侧边栏快速展示正文
```

只复制 JSONL，目标 Codex 可能找不到会话。

只复制或修改 SQLite，数据库可能指向不存在的源电脑路径。

直接覆盖目标 SQLite，会删除或覆盖目标电脑原有索引。

因此可靠迁移必须做到：

1. 复制真实正文。
2. 按 ID 合并索引。
3. 修正绝对路径。
4. 统一 provider。
5. 保留目标已有记录。
6. 修改前创建可恢复备份。

---

## 五、安全原则汇总

1. 迁移前两台电脑都完整退出 Codex。
2. 源电脑和目标电脑分别保留自己的完整备份。
3. 不把源电脑整个 `.codex` 覆盖到目标电脑。
4. 不迁移 `auth.json`、`installation_id`。
5. 不直接覆盖目标 `state_5.sqlite`。
6. 不直接覆盖目标 `session_index.jsonl`。
7. 导入后实际打开多条历史验证。
8. 至少保留备份一周。
9. 恢复时先改名保留失败现场，再恢复到全新的 `.codex`。
10. 确认恢复稳定后，才删除旧目录和备份。
