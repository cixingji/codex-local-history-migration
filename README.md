# Codex Local History Migration and Provider Index Sync

Windows 工具集：备份、恢复、跨电脑合并 Codex 本地会话，并将不同 provider 的本地索引统一到官方 `openai`。

## 解决的问题

- 中转站 provider（例如 `5_6`、`custom` 或其他自定义名称）创建的本地会话，在官方 `openai` provider 下无法显示。
- 只复制 `sessions` 后，Codex 侧边栏没有记录。
- Codex++ 的历史修复在不同 Codex 版本/数据库结构下可能显示 0 条修复。
- 两台电脑都有历史时，直接覆盖 `.codex` 会破坏目标电脑原有数据。

## 目录结构

```text
01-一键入口/       普通用户双击的 Windows 启动文件
02-脚本实现/       PowerShell 和 Node.js 实现代码
03-使用文档/       中文操作手册
04-开源资料/       安全、发布和贡献相关资料
README.md          项目总入口
LICENSE            MIT 许可证
```

第一次使用请先打开 [`03-使用文档/Codex本地会话备份恢复与跨电脑合并指南.md`](03-使用文档/Codex本地会话备份恢复与跨电脑合并指南.md)。

## 快速开始

1. 两台电脑完全退出 Codex Desktop 和 Codex++。
2. 源电脑进入 `01-一键入口`，双击 `Export-Codex-History.cmd`。
3. 将桌面生成的 `Codex-History-Export-日期时间` 整个文件夹复制到目标电脑。
4. 先在目标电脑双击 `01-一键入口/Backup-Codex-Target-Before-Merge.cmd`，再双击导出文件夹内的 `Import-Codex-History-To-OpenAI.cmd`。
5. 启动官方 Codex，切换到官方 OpenAI provider，抽查历史会话。

不依赖 Codex++ 的“立即修复历史会话”。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `01-一键入口/*.cmd` | 普通用户双击的导出、备份、导入入口 |
| `02-脚本实现/*.js` | 会话导出和跨电脑合并实现 |
| `02-脚本实现/*.ps1` | 目标电脑完整备份实现 |
| `03-使用文档/` | 操作手册、存储模型和问题诊断 |
| `04-开源资料/` | 隐私安全和发布检查资料 |

## 本地数据模型

官方文档确认会话正文位于 `$CODEX_HOME/sessions`，默认是 `~/.codex/sessions`。

本项目针对当前 Codex 版本处理以下本地数据层：

```text
sessions/*.jsonl                         聊天正文和 session_meta
archived_sessions/*.jsonl                已归档聊天正文
state_5.sqlite -> threads                官方主历史索引
sqlite/codex-dev.db -> local_thread_catalog  桌面目录缓存
session_index.jsonl                      标题和更新时间索引
```

迁移时只合并会话 ID 不存在的记录；目标已有同 ID 会话时保留目标版本。

## Provider 规则

迁移器将有值且不等于 `openai` 的 provider 统一改为小写 `openai`。这包括 `5_6`、`custom`、中转站名称和旧的大写 `OpenAI`。

`openai` 是本地索引使用的规范值；界面可能显示为 `OpenAI`。

## 开源前必须排除

不要提交以下内容：

```text
真实 sessions/ 和 archived_sessions/
state_5.sqlite 及其 WAL/SHM
auth.json
.env
installation_id
完整备份目录
checksums.json（如果其中包含真实路径或会话清单）
```

建议提交脚本、文档、测试夹具和脱敏示例，不提交真实聊天内容。

## 兼容性边界

`state_5.sqlite` 和 `codex-dev.db` 是 Codex 的内部实现，表结构可能随 Codex 升级变化。导入器会检查表和列；遇到未知必需列时停止，而不是盲目写入。

## 回滚

目标电脑导入前会创建：

```text
%USERPROFILE%\.codex\backups_state\cross-machine-import\日期时间
```

如果导入失败，退出 Codex，把当前 `.codex` 改名保留，再用目标电脑自己的完整备份恢复。不要用源电脑完整 `.codex` 覆盖目标电脑。

## 验证

导入后至少检查：

- 新旧会话标题。
- 用户消息和助手回复。
- 工具调用记录。
- 归档状态。
- 官方 OpenAI provider 下能否重新打开。
- `state_5.sqlite` 中的 provider 是否为 `openai`。
