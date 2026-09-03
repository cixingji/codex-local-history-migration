# Security and Recovery

## Never publish

不要将真实会话、认证文件、环境变量、机器 ID、完整数据库或完整备份提交到 GitHub。

## Backups

源电脑保留完整备份；目标电脑导入前也保留完整备份。导出包和目标导入器会再创建精简回滚备份。

## Conflict rule

同一会话 ID 冲突时保留目标版本，并输出冲突计数；不会静默覆盖目标聊天正文。

## Failure recovery

停止 Codex，保留失败后的 `.codex` 目录，将目标电脑自己的完整备份恢复到新的 `.codex` 目录。不要使用源电脑完整 `.codex` 恢复目标电脑。

## Test before real import

先复制到隔离用户目录，用虚拟 JSONL 和 SQLite 测试 provider 归一化、索引插入、路径修正和冲突处理，再迁移真实数据。
