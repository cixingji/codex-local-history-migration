# Diagnosis Record

## Symptom

Codex++ 显示“修复 0 个会话文件、更新 0 行数据库索引”，切换官方 OpenAI provider 后中转站历史不出现。

## Findings

1. 会话正文位于 `.codex/sessions`，每条会话是 JSONL。
2. 当前 Codex 使用 `state_5.sqlite` 的 `threads` 作为官方主历史索引。
3. 桌面目录缓存位于 `sqlite/codex-dev.db`，主要表是 `local_thread_catalog`。
4. 旧版工具未正确处理多数据库和索引重建，因而可能“操作完成但修改数为 0”。
5. provider 是字符串标识，规范值应为小写 `openai`。

## Failed attempts

- 只改 `codex-dev.db`：没有改变官方主索引，官方仍看见旧 provider。
- 写入大写 `OpenAI`：与主索引规范值 `openai` 不一致。
- 依赖 PowerShell 预扫描：部分大型 JSONL 被解析器跳过。
- 运行中修改 SQLite：可能被 WAL 或 Codex 的后台写入覆盖。

## Final approach

- Node.js 解析 JSONL，避免 PowerShell JSON 兼容差异。
- 合并 `state_5.sqlite`，不覆盖目标库。
- 按会话 ID 去重，目标冲突保留目标版本。
- 修正目标电脑的 `rollout_path`。
- 同步 `local_thread_catalog` 和 `session_index.jsonl`。
- 所有写入前自动备份，并在导入包内做 SHA-256 校验。

## Scope note

Codex 内部 SQLite schema 不是稳定公开 API。脚本应在新版本 Codex 上先用脱敏测试目录演练，再处理真实数据。
